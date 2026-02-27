import type { Session } from './types.js';

const DEFAULT_REDACTED_THOUGHT_CONTENT = '[REDACTED]';

interface SessionTtlStore {
  getTtlMs(): number;
  getExpiresAt(sessionId: string): number | undefined;
}

interface SessionLifecycleTarget {
  id: string;
  updatedAt: number;
}

export function requireSession(
  sessionId: string,
  getSession: (sessionId: string) => Readonly<Session> | undefined,
  buildError: (sessionId: string) => Error
): Readonly<Session> {
  const session = getSession(sessionId);
  if (!session) {
    throw buildError(sessionId);
  }
  return session;
}

export function getSessionLifecycle(
  session: Readonly<SessionLifecycleTarget>,
  store: SessionTtlStore
): { ttlMs: number; expiresAt: number } {
  const ttlMs = store.getTtlMs();
  return {
    ttlMs,
    expiresAt: store.getExpiresAt(session.id) ?? session.updatedAt + ttlMs,
  };
}

export function buildSessionView(
  session: Readonly<Session>,
  options?: { redactThoughtContent?: boolean; redactedText?: string }
): Readonly<Session> {
  if (!options?.redactThoughtContent) {
    return session;
  }

  const redactedText = options.redactedText ?? DEFAULT_REDACTED_THOUGHT_CONTENT;

  return {
    ...session,
    thoughts: session.thoughts.map((thought) => ({
      index: thought.index,
      content: redactedText,
      revision: thought.revision,
      ...(thought.stepSummary !== undefined
        ? { stepSummary: redactedText }
        : {}),
    })),
  };
}
