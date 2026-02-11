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

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  create(level: ReasoningLevel): Session {
    const config: LevelConfig = LEVEL_CONFIGS[level];
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      level,
      thoughts: [],
      tokenBudget: config.tokenBudget,
      tokensUsed: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.scheduleTtl(session.id);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): boolean {
    this.clearTtl(id);
    return this.sessions.delete(id);
  }

  addThought(sessionId: string, content: string): Thought {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const thought: Thought = {
      index: session.thoughts.length,
      content,
      revision: 0,
    };
    session.thoughts.push(thought);
    session.tokensUsed += content.length;
    session.updatedAt = Date.now();
    this.resetTtl(sessionId);
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
    const oldLength = existing.content.length;
    const revised: Thought = {
      index: thoughtIndex,
      content,
      revision: existing.revision + 1,
    };
    session.thoughts[thoughtIndex] = revised;
    session.tokensUsed = session.tokensUsed - oldLength + content.length;
    session.updatedAt = Date.now();
    this.resetTtl(sessionId);
    return revised;
  }

  private scheduleTtl(sessionId: string): void {
    const timer = setTimeout(() => {
      const didExpire = this.sessions.delete(sessionId);
      this.timers.delete(sessionId);
      if (didExpire) {
        engineEvents.emit('session:expired', { sessionId });
      }
    }, this.ttlMs);
    timer.unref();
    this.timers.set(sessionId, timer);
  }

  private clearTtl(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }

  private resetTtl(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (!timer) {
      this.scheduleTtl(sessionId);
      return;
    }
    timer.refresh();
  }
}
