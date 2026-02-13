import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type {
  LevelConfig,
  ReasoningLevel,
  Session,
  Thought,
} from '../lib/types.js';

import { LEVEL_CONFIGS } from './config.js';
import { engineEvents } from './events.js';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_MAX_TOTAL_TOKENS = 500_000;

interface SessionOrderNode {
  prevId: string | undefined;
  nextId: string | undefined;
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type MutableThought = Mutable<Thought>;
type MutableSession = Omit<Mutable<Session>, 'thoughts'> & {
  thoughts: MutableThought[];
};

function estimateTokens(text: string): number {
  const byteLength = Buffer.byteLength(text, 'utf8');
  return Math.max(1, Math.ceil(byteLength / 4));
}

export class SessionStore {
  private readonly sessions = new Map<string, MutableSession>();
  private readonly sessionOrder = new Map<string, SessionOrderNode>();
  private oldestSessionId: string | undefined;
  private newestSessionId: string | undefined;
  private sortedSessionIdsCache: string[] | null = null;
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly maxTotalTokens: number;
  private totalTokens = 0;

  constructor(
    ttlMs: number = DEFAULT_TTL_MS,
    maxSessions: number = DEFAULT_MAX_SESSIONS,
    maxTotalTokens: number = DEFAULT_MAX_TOTAL_TOKENS
  ) {
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.maxTotalTokens = maxTotalTokens;
    const sweepInterval = Math.max(10, Math.min(60_000, ttlMs));
    this.cleanupInterval = setInterval(() => {
      this.sweep();
    }, sweepInterval);
    this.cleanupInterval.unref();
  }

  create(level: ReasoningLevel, totalThoughts?: number): Readonly<Session> {
    this.evictIfAtCapacity();
    const config: LevelConfig = LEVEL_CONFIGS[level];
    const now = Date.now();
    const session: MutableSession = {
      id: randomUUID(),
      level,
      status: 'active',
      thoughts: [],
      totalThoughts: totalThoughts ?? config.minThoughts,
      tokenBudget: config.tokenBudget,
      tokensUsed: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.addToOrder(session.id);
    this.sortedSessionIdsCache = null;
    this.emitSessionsListChanged();
    this.emitSessionsResourceUpdated();
    return this.snapshotSession(session);
  }

  get(id: string): Readonly<Session> | undefined {
    const session = this.sessions.get(id);
    return session ? this.snapshotSession(session) : undefined;
  }

  list(): Readonly<Session>[] {
    this.sortedSessionIdsCache ??= this.buildSortedSessionIdsCache();
    const sessions: Session[] = [];
    for (const sessionId of this.sortedSessionIdsCache) {
      const session = this.sessions.get(sessionId);
      if (session) {
        sessions.push(this.snapshotSession(session));
      }
    }
    return sessions;
  }

  getTtlMs(): number {
    return this.ttlMs;
  }

  getExpiresAt(sessionId: string): number | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return session.updatedAt + this.ttlMs;
  }

  getTotalTokensUsed(): number {
    return this.totalTokens;
  }

  delete(id: string): boolean {
    const session = this.deleteSessionInternal(id);
    if (!session) {
      return false;
    }
    engineEvents.emit('session:deleted', { sessionId: id });
    this.emitSessionsCollectionUpdated();
    return true;
  }

  addThought(sessionId: string, content: string): Thought {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const tokens = estimateTokens(content);
    this.evictForTokenHeadroom(tokens, sessionId);
    const thought: MutableThought = {
      index: session.thoughts.length,
      content,
      revision: 0,
    };
    session.thoughts.push(thought);
    session.tokensUsed += tokens;
    this.totalTokens += tokens;
    this.markSessionTouched(session);
    return this.snapshotThought(thought);
  }

  reviseThought(
    sessionId: string,
    thoughtIndex: number,
    content: string
  ): Thought {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const existing = session.thoughts[thoughtIndex];
    if (!existing) {
      throw new Error(
        `Thought index ${String(thoughtIndex)} not found in session ${sessionId}`
      );
    }
    const oldTokens = estimateTokens(existing.content);
    const newTokens = estimateTokens(content);
    const delta = newTokens - oldTokens;
    if (delta > 0) {
      this.evictForTokenHeadroom(delta, sessionId);
    }
    const revised: MutableThought = {
      index: thoughtIndex,
      content,
      revision: existing.revision + 1,
    };
    session.thoughts[thoughtIndex] = revised;
    session.tokensUsed = session.tokensUsed - oldTokens + newTokens;
    this.totalTokens += delta;
    this.markSessionTouched(session);
    return this.snapshotThought(revised);
  }

  markCompleted(sessionId: string): void {
    this.updateSessionStatus(sessionId, 'completed');
  }

  markCancelled(sessionId: string): void {
    this.updateSessionStatus(sessionId, 'cancelled');
  }

  private updateSessionStatus(
    sessionId: string,
    status: 'completed' | 'cancelled'
  ): void {
    const session = this.sessions.get(sessionId);
    if (session?.status === 'active') {
      session.status = status;
      this.markSessionTouched(session);
    }
  }

  private evictIfAtCapacity(): void {
    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.findOldestSession();
      if (!oldest) break;
      this.deleteSessionInternal(oldest.id);
      engineEvents.emit('session:evicted', {
        sessionId: oldest.id,
        reason: 'max_sessions',
      });
      this.emitSessionsCollectionUpdated();
    }
  }

  private evictForTokenHeadroom(
    neededTokens: number,
    protectedSessionId?: string
  ): void {
    while (
      this.totalTokens + neededTokens > this.maxTotalTokens &&
      this.sessions.size > (protectedSessionId ? 1 : 0)
    ) {
      const oldest = this.findOldestSession(protectedSessionId);
      if (!oldest) break;
      this.deleteSessionInternal(oldest.id);
      engineEvents.emit('session:evicted', {
        sessionId: oldest.id,
        reason: 'max_total_tokens',
      });
      this.emitSessionsCollectionUpdated();
    }
  }

  private findOldestSession(excludeId?: string): MutableSession | undefined {
    let currentId = this.oldestSessionId;
    while (currentId) {
      if (currentId !== excludeId) {
        return this.sessions.get(currentId);
      }
      currentId = this.sessionOrder.get(currentId)?.nextId;
    }
    return undefined;
  }

  private sweep(): void {
    const now = Date.now();
    const expiredSessionIds: string[] = [];
    let changed = false;
    let currentId = this.oldestSessionId;
    while (currentId) {
      const session = this.sessions.get(currentId);
      if (!session) {
        const node = this.sessionOrder.get(currentId);
        currentId = node?.nextId;
        continue;
      }
      if (session.updatedAt + this.ttlMs >= now) {
        break;
      }
      expiredSessionIds.push(currentId);
      currentId = this.sessionOrder.get(currentId)?.nextId;
    }
    for (const sessionId of expiredSessionIds) {
      if (!this.deleteSessionInternal(sessionId)) {
        continue;
      }
      engineEvents.emit('session:expired', { sessionId });
      changed = true;
    }
    if (changed) {
      this.emitSessionsCollectionUpdated();
    }
  }

  private buildSortedSessionIdsCache(): string[] {
    const sortedSessionIds: string[] = [];
    let currentId = this.newestSessionId;
    while (currentId) {
      if (this.sessions.has(currentId)) {
        sortedSessionIds.push(currentId);
      }
      currentId = this.sessionOrder.get(currentId)?.prevId;
    }
    return sortedSessionIds;
  }

  private addToOrder(sessionId: string): void {
    if (this.sessionOrder.has(sessionId)) {
      this.touchOrder(sessionId);
      return;
    }

    const node: SessionOrderNode = { prevId: undefined, nextId: undefined };
    if (this.newestSessionId) {
      const newest = this.sessionOrder.get(this.newestSessionId);
      if (newest) {
        newest.nextId = sessionId;
      }
      node.prevId = this.newestSessionId;
    } else {
      this.oldestSessionId = sessionId;
    }

    this.newestSessionId = sessionId;
    this.sessionOrder.set(sessionId, node);
  }

  private touchOrder(sessionId: string): void {
    if (this.newestSessionId === sessionId) {
      return;
    }

    const node = this.sessionOrder.get(sessionId);
    if (!node) {
      this.addToOrder(sessionId);
      return;
    }

    const { prevId, nextId } = node;
    if (prevId) {
      const previous = this.sessionOrder.get(prevId);
      if (previous) {
        previous.nextId = nextId;
      }
    } else {
      this.oldestSessionId = nextId;
    }

    if (nextId) {
      const next = this.sessionOrder.get(nextId);
      if (next) {
        next.prevId = prevId;
      }
    }

    node.prevId = this.newestSessionId;
    node.nextId = undefined;

    if (this.newestSessionId) {
      const newest = this.sessionOrder.get(this.newestSessionId);
      if (newest) {
        newest.nextId = sessionId;
      }
    } else {
      this.oldestSessionId = sessionId;
    }

    this.newestSessionId = sessionId;
  }

  private removeFromOrder(sessionId: string): void {
    const node = this.sessionOrder.get(sessionId);
    if (!node) {
      return;
    }

    const { prevId, nextId } = node;
    if (prevId) {
      const previous = this.sessionOrder.get(prevId);
      if (previous) {
        previous.nextId = nextId;
      }
    } else {
      this.oldestSessionId = nextId;
    }

    if (nextId) {
      const next = this.sessionOrder.get(nextId);
      if (next) {
        next.prevId = prevId;
      }
    } else {
      this.newestSessionId = prevId;
    }

    this.sessionOrder.delete(sessionId);
  }

  private deleteSessionInternal(id: string): MutableSession | undefined {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }

    this.totalTokens -= session.tokensUsed;
    this.sessions.delete(id);
    this.removeFromOrder(id);
    this.sortedSessionIdsCache = null;
    return session;
  }

  private markSessionTouched(session: MutableSession): void {
    session.updatedAt = Date.now();
    this.touchOrder(session.id);
    this.sortedSessionIdsCache = null;
    this.emitSessionResourcesUpdated(session.id);
  }

  private snapshotThought(thought: MutableThought): Thought {
    return {
      index: thought.index,
      content: thought.content,
      revision: thought.revision,
    };
  }

  private snapshotSession(session: MutableSession): Session {
    return {
      id: session.id,
      level: session.level,
      status: session.status,
      thoughts: session.thoughts.map((thought) =>
        this.snapshotThought(thought)
      ),
      totalThoughts: session.totalThoughts,
      tokenBudget: session.tokenBudget,
      tokensUsed: session.tokensUsed,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private emitSessionsListChanged(): void {
    engineEvents.emit('resources:changed', { uri: 'reasoning://sessions' });
  }

  private emitSessionsResourceUpdated(): void {
    engineEvents.emit('resource:updated', { uri: 'reasoning://sessions' });
  }

  private emitSessionsCollectionUpdated(): void {
    this.emitSessionsListChanged();
    this.emitSessionsResourceUpdated();
  }

  private emitSessionResourcesUpdated(sessionId: string): void {
    engineEvents.emit('resource:updated', {
      uri: `reasoning://sessions/${sessionId}`,
    });
    this.emitSessionsResourceUpdated();
  }
}
