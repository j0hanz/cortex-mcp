import {
  InvalidRunModeArgsError,
  ReasoningAbortedError,
  SessionNotFoundError,
} from '../lib/errors.js';
import { requireSession } from '../lib/session.js';
import type { ReasoningLevel, Session } from '../lib/types.js';
import { parsePositiveIntEnv } from '../lib/utils.js';

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

// Clean up stale lock entries when sessions are removed
for (const event of [
  'session:expired',
  'session:evicted',
  'session:deleted',
] as const) {
  engineEvents.on(event, (data: { sessionId: string }) => {
    sessionLocks.delete(data.sessionId);
  });
}

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

  const content = resolveThoughtContent(
    thought,
    observation,
    hypothesis,
    evaluation
  );

  if (!content && rollbackToStep === undefined) {
    throw new InvalidRunModeArgsError(
      'Either thought (or observation/hypothesis/evaluation) or rollbackToStep is required'
    );
  }

  const session = resolveSession(level, sessionId, query, targetThoughts);
  const config = getLevelConfig(session.level);
  const { totalThoughts } = session;
  const shouldUpdateQuery = sessionId !== undefined && query.length > 0;

  return runWithContext({ sessionId: session.id }, () =>
    withSessionLock(session.id, async () => {
      throwIfReasoningAborted(abortSignal);

      let current = getSessionOrThrow(session.id);

      if (rollbackToStep !== undefined) {
        current = sessionStore.rollback(session.id, rollbackToStep);
      }

      if (shouldUpdateQuery) {
        current = sessionStore.updateQuery(session.id, query);
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

      const { thought: addedThought, session: updated } =
        sessionStore.addThought(session.id, content, stepSummary);
      engineEvents.emit('thought:added', {
        sessionId: session.id,
        index: addedThought.index,
        content: addedThought.content,
      });

      emitBudgetExhaustedIfNeeded({
        session: updated,
        tokenBudget: config.tokenBudget,
        generatedThoughts: addedThought.index + 1,
        requestedThoughts: totalThoughts,
      });

      let finalSession = updated;
      if (isConclusion || updated.thoughts.length >= totalThoughts) {
        finalSession = sessionStore.markCompleted(session.id);
      }

      await reportProgress(
        onProgress,
        addedThought.index + 1,
        totalThoughts,
        stepSummary,
        abortSignal
      );

      return finalSession;
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

function resolveThoughtContent(
  thought: string | undefined,
  observation: string | undefined,
  hypothesis: string | undefined,
  evaluation: string | undefined
): string | undefined {
  if (thought) {
    return thought;
  }
  if (
    observation !== undefined &&
    hypothesis !== undefined &&
    evaluation !== undefined
  ) {
    return `**Observation:** ${observation}\n\n**Hypothesis:** ${hypothesis}\n\n**Evaluation:** ${evaluation}`;
  }
  return undefined;
}

type ProgressCallback = (
  progress: number,
  total: number,
  stepSummary?: string
) => void | Promise<void>;

async function reportProgress(
  onProgress: ProgressCallback | undefined,
  step: number,
  total: number,
  summary: string | undefined,
  abortSignal: AbortSignal | undefined
): Promise<void> {
  if (!onProgress) {
    return;
  }
  try {
    await onProgress(step, total, summary);
  } catch (progressError) {
    // Log but don't propagate transport errors — re-throw only on abort
    engineEvents.emit('error', progressError);
    throwIfReasoningAborted(abortSignal);
  }
  throwIfReasoningAborted(abortSignal);
}
