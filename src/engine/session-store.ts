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

function estimateTokens(text: string): number {
  const byteLength = Buffer.byteLength(text, 'utf8');
  return Math.max(1, Math.ceil(byteLength / 4));
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
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

  create(level: ReasoningLevel, totalThoughts?: number): Session {
    this.evictIfAtCapacity();
    const config: LevelConfig = LEVEL_CONFIGS[level];
    const now = Date.now();
    const session: Session = {
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
    engineEvents.emit('resources:changed', { uri: 'reasoning://sessions' });
    return session;
  }

  get(id: string): Readonly<Session> | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return [...this.sessions.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
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
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    this.totalTokens -= session.tokensUsed;
    this.sessions.delete(id);
    engineEvents.emit('session:deleted', { sessionId: id });
    engineEvents.emit('resources:changed', { uri: 'reasoning://sessions' });
    return true;
  }

  addThought(sessionId: string, content: string): Thought {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const tokens = estimateTokens(content);
    this.evictForTokenHeadroom(tokens, sessionId);
    const thought: Thought = {
      index: session.thoughts.length,
      content,
      revision: 0,
    };
    session.thoughts.push(thought);
    session.tokensUsed += tokens;
    this.totalTokens += tokens;
    session.updatedAt = Date.now();
    engineEvents.emit('resource:updated', {
      uri: `reasoning://sessions/${sessionId}`,
    });
    return thought;
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
    const revised: Thought = {
      index: thoughtIndex,
      content,
      revision: existing.revision + 1,
    };
    session.thoughts[thoughtIndex] = revised;
    session.tokensUsed = session.tokensUsed - oldTokens + newTokens;
    this.totalTokens += delta;
    session.updatedAt = Date.now();
    engineEvents.emit('resource:updated', {
      uri: `reasoning://sessions/${sessionId}`,
    });
    return revised;
  }

  markCompleted(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.status === 'active') {
      session.status = 'completed';
      session.updatedAt = Date.now();
    }
  }

  markCancelled(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.status === 'active') {
      session.status = 'cancelled';
      session.updatedAt = Date.now();
    }
  }

  private evictIfAtCapacity(): void {
    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.findOldestSession();
      if (!oldest) break;
      this.totalTokens -= oldest.tokensUsed;
      this.sessions.delete(oldest.id);
      engineEvents.emit('session:evicted', {
        sessionId: oldest.id,
        reason: 'max_sessions',
      });
      engineEvents.emit('resources:changed', { uri: 'reasoning://sessions' });
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
      this.totalTokens -= oldest.tokensUsed;
      this.sessions.delete(oldest.id);
      engineEvents.emit('session:evicted', {
        sessionId: oldest.id,
        reason: 'max_total_tokens',
      });
      engineEvents.emit('resources:changed', { uri: 'reasoning://sessions' });
    }
  }

  private findOldestSession(excludeId?: string): Session | undefined {
    let oldest: Session | undefined;
    for (const session of this.sessions.values()) {
      if (session.id === excludeId) continue;
      if (!oldest || session.updatedAt < oldest.updatedAt) {
        oldest = session;
      }
    }
    return oldest;
  }

  private sweep(): void {
    const now = Date.now();
    let changed = false;
    for (const session of this.sessions.values()) {
      if (session.updatedAt + this.ttlMs < now) {
        this.totalTokens -= session.tokensUsed;
        this.sessions.delete(session.id);
        engineEvents.emit('session:expired', { sessionId: session.id });
        changed = true;
      }
    }
    if (changed) {
      engineEvents.emit('resources:changed', { uri: 'reasoning://sessions' });
    }
  }
}
