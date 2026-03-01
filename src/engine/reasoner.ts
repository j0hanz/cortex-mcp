import {
  InvalidRunModeArgsError,
  ReasoningAbortedError,
  SessionNotFoundError,
} from '../lib/errors.js';
import { requireSession } from '../lib/session-utils.js';
import type { ReasoningLevel, Session } from '../lib/types.js';
import { parsePositiveIntEnv } from '../lib/validators.js';

import { getLevelConfig } from './config.js';
import { runWithContext } from './context.js';
import { engineEvents } from './events.js';
import { resolveThoughtCount } from './heuristics.js';
import {
  DEFAULT_MAX_SESSIONS,
  DEFAULT_MAX_TOTAL_TOKENS,
  DEFAULT_SESSION_TTL_MS,
  SessionStore,
} from './session-store.js';

const sessionStore = new SessionStore(
  parsePositiveIntEnv('CORTEX_SESSION_TTL_MS', DEFAULT_SESSION_TTL_MS),
  parsePositiveIntEnv('CORTEX_MAX_SESSIONS', DEFAULT_MAX_SESSIONS),
  parsePositiveIntEnv('CORTEX_MAX_TOTAL_TOKENS', DEFAULT_MAX_TOTAL_TOKENS)
);

const sessionLocks = new Map<string, Promise<void>>();

export { sessionStore };

interface ReasonOptions {
  sessionId?: string;
  targetThoughts?: number;
  thought?: string;
  observation?: string;
  hypothesis?: string;
  evaluation?: string;
  stepSummary?: string;
  isConclusion?: boolean;
  rollbackToStep?: number;
  abortSignal?: AbortSignal;
  onProgress?: (
    progress: number,
    total: number,
    stepSummary?: string
  ) => void | Promise<void>;
}

export async function reason(
  query: string,
  level: ReasoningLevel | undefined,
  options?: ReasonOptions
): Promise<Readonly<Session>> {
  const {
    sessionId,
    targetThoughts,
    thought,
    observation,
    hypothesis,
    evaluation,
    stepSummary,
    isConclusion,
    rollbackToStep,
    abortSignal,
    onProgress,
  } = options ?? {};

  const hasStructuredInput =
    observation !== undefined &&
    hypothesis !== undefined &&
    evaluation !== undefined;

  const hasContent = thought !== undefined || hasStructuredInput;

  if (!hasContent && rollbackToStep === undefined) {
    throw new InvalidRunModeArgsError(
      'Either thought (or observation/hypothesis/evaluation) or rollback_to_step is required'
    );
  }

  const session = resolveSession(level, sessionId, query, targetThoughts);
  const config = getLevelConfig(session.level);
  const { totalThoughts } = session;
  const shouldUpdateQuery = sessionId !== undefined && query.length > 0;

  return runWithContext({ sessionId: session.id }, () =>
    withSessionLock(session.id, async () => {
      throwIfReasoningAborted(abortSignal);

      if (rollbackToStep !== undefined) {
        sessionStore.rollback(session.id, rollbackToStep);
      }

      if (shouldUpdateQuery) {
        sessionStore.updateQuery(session.id, query);
      }

      const current = getSessionOrThrow(session.id);

      let content = thought;
      if (!content && hasStructuredInput) {
        content = `**Observation:** ${observation}\n\n**Hypothesis:** ${hypothesis}\n\n**Evaluation:** ${evaluation}`;
      }

      if (!content) {
        // Only rollback occurred
        return current;
      }

      if (
        emitBudgetExhaustedIfNeeded({
          session: current,
          tokenBudget: config.tokenBudget,
          generatedThoughts: 0,
          requestedThoughts: totalThoughts,
        })
      ) {
        return current;
      }

      const nextIndex = current.thoughts.length;
      if (nextIndex >= totalThoughts && !isConclusion) {
        return current;
      }

      const addedThought = sessionStore.addThought(
        session.id,
        content,
        stepSummary
      );
      engineEvents.emit('thought:added', {
        sessionId: session.id,
        index: addedThought.index,
        content: addedThought.content,
      });

      const updated = getSessionOrThrow(session.id);
      emitBudgetExhaustedIfNeeded({
        session: updated,
        tokenBudget: config.tokenBudget,
        generatedThoughts: addedThought.index + 1,
        requestedThoughts: totalThoughts,
      });

      if (isConclusion || updated.thoughts.length >= totalThoughts) {
        sessionStore.markCompleted(session.id);
      }

      if (onProgress) {
        await onProgress(addedThought.index + 1, totalThoughts, stepSummary);
        throwIfReasoningAborted(abortSignal);
      }

      return getSessionOrThrow(session.id);
    })
  );
}

async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve();

  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  const currentTail = previous.then(() => next);
  sessionLocks.set(sessionId, currentTail);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(sessionId) === currentTail) {
      sessionLocks.delete(sessionId);
    }
  }
}

function getSessionOrThrow(sessionId: string): Readonly<Session> {
  return requireSession(
    sessionId,
    (id) => sessionStore.get(id),
    (id) => new SessionNotFoundError(id)
  );
}

function emitBudgetExhaustedIfNeeded(args: {
  session: Readonly<Session>;
  tokenBudget: number;
  generatedThoughts: number;
  requestedThoughts: number;
}): boolean {
  const { session, tokenBudget, generatedThoughts, requestedThoughts } = args;
  if (session.tokensUsed < tokenBudget) {
    return false;
  }
  engineEvents.emit('thought:budget-exhausted', {
    sessionId: session.id,
    tokensUsed: session.tokensUsed,
    tokenBudget,
    generatedThoughts,
    requestedThoughts,
  });
  return true;
}

function assertExistingSessionConstraints(
  existing: Readonly<Session>,
  targetThoughts?: number
): void {
  if (
    targetThoughts !== undefined &&
    targetThoughts !== existing.totalThoughts
  ) {
    throw new InvalidRunModeArgsError(
      `Cannot change targetThoughts on an existing session (current: ${String(
        existing.totalThoughts
      )}). Omit targetThoughts or pass ${String(existing.totalThoughts)}.`
    );
  }
}

function resolveSession(
  level: ReasoningLevel | undefined,
  sessionId: string | undefined,
  query: string,
  targetThoughts?: number
): Readonly<Session> {
  if (sessionId) {
    const existing = getSessionOrThrow(sessionId);
    assertExistingSessionConstraints(existing, targetThoughts);
    return existing;
  }

  if (level === undefined) {
    throw new InvalidRunModeArgsError('level is required for new sessions');
  }

  const config = getLevelConfig(level);
  const totalThoughts = resolveThoughtCount(
    level,
    query,
    config,
    targetThoughts
  );
  const session = sessionStore.create(level, totalThoughts, query);
  engineEvents.emit('session:created', {
    sessionId: session.id,
    level,
  });
  return session;
}

function throwIfReasoningAborted(signal?: AbortSignal): void {
  if (!signal) {
    return;
  }
  try {
    signal.throwIfAborted();
  } catch {
    throw new ReasoningAbortedError();
  }
}
