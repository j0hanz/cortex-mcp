import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type {
  LevelConfig,
  ReasoningLevel,
  Session,
  SessionSummary,
  Thought,
} from '../lib/types.js';

import { getLevelConfig } from './config.js';
import { engineEvents } from './events.js';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_MAX_TOTAL_TOKENS = 500_000;
const TOKEN_ESTIMATE_DIVISOR = 4;
const MIN_SWEEP_INTERVAL_MS = 10;
const MAX_SWEEP_INTERVAL_MS = 60_000;

interface SessionOrderNode {
  prevId: string | undefined;
  nextId: string | undefined;
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type MutableThought = Mutable<Thought> & {
  tokenCount?: number;
};
type MutableSession = Omit<Mutable<Session>, 'thoughts'> & {
  thoughts: MutableThought[];
  _cachedSnapshot?: Session | undefined;
  _cachedSummary?: SessionSummary | undefined;
};

function estimateTokens(text: string): number {
  const byteLength = Buffer.byteLength(text, 'utf8');
  return Math.max(1, Math.ceil(byteLength / TOKEN_ESTIMATE_DIVISOR));
}

function getThoughtTokenCount(
  thought: Pick<MutableThought, 'content' | 'tokenCount'>
): number {
  return thought.tokenCount ?? estimateTokens(thought.content);
}

function resolveSweepInterval(ttlMs: number): number {
  return Math.max(
    MIN_SWEEP_INTERVAL_MS,
    Math.min(MAX_SWEEP_INTERVAL_MS, ttlMs)
  );
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
    const sweepInterval = resolveSweepInterval(ttlMs);
    this.cleanupInterval = setInterval(() => {
      this.sweep();
    }, sweepInterval);
    this.cleanupInterval.unref();
  }

  create(level: ReasoningLevel, totalThoughts?: number): Readonly<Session> {
    this.evictIfAtCapacity();
    const config: LevelConfig = getLevelConfig(level);
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

  getSummary(id: string): Readonly<SessionSummary> | undefined {
    const session = this.sessions.get(id);
    return session ? this.snapshotSessionSummary(session) : undefined;
  }

  list(): Readonly<Session>[] {
    return this.collectSessions(this.snapshotSession.bind(this));
  }

  listSessionIds(): readonly string[] {
    this.sortedSessionIdsCache ??= this.buildSortedSessionIdsCache();
    return [...this.sortedSessionIdsCache];
  }

  listSummaries(): readonly SessionSummary[] {
    return this.collectSessions(this.snapshotSessionSummary.bind(this));
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

  addThought(
    sessionId: string,
    content: string,
    stepSummary?: string
  ): Thought {
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
      tokenCount: tokens,
      ...(stepSummary !== undefined ? { stepSummary } : {}),
    };
    session.thoughts.push(thought);
    session.tokensUsed += tokens;
    this.totalTokens += tokens;
    this.markSessionTouched(session);
    return this.snapshotThought(thought);
  }

  rollback(sessionId: string, toIndex: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // If toIndex is out of bounds or implies no change, return.
    // We keep thoughts up to and including toIndex.
    if (toIndex < 0 || toIndex >= session.thoughts.length - 1) {
      return;
    }

    const removedThoughts = session.thoughts.slice(toIndex + 1);
    session.thoughts = session.thoughts.slice(0, toIndex + 1);

    let removedTokens = 0;
    for (const t of removedThoughts) {
      removedTokens += getThoughtTokenCount(t);
    }

    session.tokensUsed -= removedTokens;
    this.totalTokens -= removedTokens;
    this.markSessionTouched(session);
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
    const oldTokens = getThoughtTokenCount(existing);
    const newTokens = estimateTokens(content);
    const delta = newTokens - oldTokens;
    if (delta > 0) {
      this.evictForTokenHeadroom(delta, sessionId);
    }
    const revised: MutableThought = {
      index: thoughtIndex,
      content,
      revision: existing.revision + 1,
      tokenCount: newTokens,
      ...(existing.stepSummary !== undefined
        ? { stepSummary: existing.stepSummary }
        : {}),
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
      this.emitSessionEvicted(oldest.id, 'max_sessions');
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
      this.emitSessionEvicted(oldest.id, 'max_total_tokens');
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
    let changed = false;
    let currentId = this.oldestSessionId;
    while (currentId) {
      const nextId = this.sessionOrder.get(currentId)?.nextId;
      const session = this.sessions.get(currentId);
      if (!session) {
        currentId = nextId;
        continue;
      }
      if (session.updatedAt + this.ttlMs >= now) {
        break;
      }

      if (this.deleteSessionInternal(currentId)) {
        engineEvents.emit('session:expired', { sessionId: currentId });
        changed = true;
      }
      currentId = nextId;
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
      this.setNextId(this.newestSessionId, sessionId);
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
      this.setNextId(prevId, nextId);
    } else {
      this.oldestSessionId = nextId;
    }

    if (nextId) {
      this.setPrevId(nextId, prevId);
    }

    node.prevId = this.newestSessionId;
    node.nextId = undefined;

    if (this.newestSessionId) {
      this.setNextId(this.newestSessionId, sessionId);
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
      this.setNextId(prevId, nextId);
    } else {
      this.oldestSessionId = nextId;
    }

    if (nextId) {
      this.setPrevId(nextId, prevId);
    } else {
      this.newestSessionId = prevId;
    }

    this.sessionOrder.delete(sessionId);
  }

  private setNextId(sessionId: string, nextId: string | undefined): void {
    const node = this.sessionOrder.get(sessionId);
    if (node) {
      node.nextId = nextId;
    }
  }

  private setPrevId(sessionId: string, prevId: string | undefined): void {
    const node = this.sessionOrder.get(sessionId);
    if (node) {
      node.prevId = prevId;
    }
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
    session._cachedSnapshot = undefined;
    session._cachedSummary = undefined;
    this.touchOrder(session.id);
    this.sortedSessionIdsCache = null;
    this.emitSessionResourcesUpdated(session.id);
  }

  private getSessionIdsForIteration(): readonly string[] {
    this.sortedSessionIdsCache ??= this.buildSortedSessionIdsCache();
    return this.sortedSessionIdsCache;
  }

  private collectSessions<T>(mapSession: (session: MutableSession) => T): T[] {
    const collected: T[] = [];
    for (const sessionId of this.getSessionIdsForIteration()) {
      const session = this.sessions.get(sessionId);
      if (session) {
        collected.push(mapSession(session));
      }
    }
    return collected;
  }

  private snapshotThought(thought: MutableThought): Thought {
    const t = {
      index: thought.index,
      content: thought.content,
      revision: thought.revision,
      ...(thought.stepSummary !== undefined
        ? { stepSummary: thought.stepSummary }
        : {}),
    };
    Object.freeze(t);
    return t;
  }

  private snapshotSession(session: MutableSession): Session {
    if (session._cachedSnapshot) {
      return session._cachedSnapshot;
    }
    const thoughts = session.thoughts.map((thought) =>
      this.snapshotThought(thought)
    );
    const snapshot: Session = {
      id: session.id,
      level: session.level,
      status: session.status,
      thoughts,
      totalThoughts: session.totalThoughts,
      tokenBudget: session.tokenBudget,
      tokensUsed: session.tokensUsed,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
    Object.freeze(snapshot);
    Object.freeze(snapshot.thoughts);
    session._cachedSnapshot = snapshot;
    return snapshot;
  }

  private snapshotSessionSummary(session: MutableSession): SessionSummary {
    if (session._cachedSummary) {
      return session._cachedSummary;
    }
    const summary: SessionSummary = {
      id: session.id,
      level: session.level,
      status: session.status,
      generatedThoughts: session.thoughts.length,
      totalThoughts: session.totalThoughts,
      tokenBudget: session.tokenBudget,
      tokensUsed: session.tokensUsed,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
    Object.freeze(summary);
    session._cachedSummary = summary;
    return summary;
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

  private emitSessionEvicted(sessionId: string, reason: string): void {
    engineEvents.emit('session:evicted', {
      sessionId,
      reason,
    });
    this.emitSessionsCollectionUpdated();
  }

  private emitSessionResourcesUpdated(sessionId: string): void {
    engineEvents.emit('resource:updated', {
      uri: `reasoning://sessions/${sessionId}`,
    });
    this.emitSessionsResourceUpdated();
  }
}
