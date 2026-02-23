import { Buffer } from 'node:buffer';

import { createSegmenter } from '../lib/text.js';
import type { LevelConfig, ReasoningLevel, Session } from '../lib/types.js';

import { assertTargetThoughtsInRange, getLevelConfig } from './config.js';
import { runWithContext } from './context.js';
import { engineEvents } from './events.js';
import {
  DEFAULT_MAX_SESSIONS,
  DEFAULT_MAX_TOTAL_TOKENS,
  DEFAULT_SESSION_TTL_MS,
  SessionStore,
} from './session-store.js';

const NON_WHITESPACE = /\S/u;
const COMPLEXITY_KEYWORDS =
  /\b(compare|analy[sz]e|trade[- ]?off|design|plan|critique|evaluate|review|architecture)\b/i;

function parsePositiveIntEnv(
  name: string,
  fallback: number,
  minimum = 1
): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    return fallback;
  }
  return parsed;
}

const sessionStore = new SessionStore(
  parsePositiveIntEnv('CORTEX_SESSION_TTL_MS', DEFAULT_SESSION_TTL_MS),
  parsePositiveIntEnv('CORTEX_MAX_SESSIONS', DEFAULT_MAX_SESSIONS),
  parsePositiveIntEnv('CORTEX_MAX_TOTAL_TOKENS', DEFAULT_MAX_TOTAL_TOKENS)
);

let _sentenceSegmenter: Intl.Segmenter | undefined;
let _sentenceSegmenterInitialized = false;

function getSentenceSegmenter(): Intl.Segmenter | undefined {
  if (!_sentenceSegmenterInitialized) {
    _sentenceSegmenter = createSegmenter('sentence');
    _sentenceSegmenterInitialized = true;
  }
  return _sentenceSegmenter;
}

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
  onProgress?: (progress: number, total: number) => void | Promise<void>;
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

  const hasContent =
    thought !== undefined ||
    (observation !== undefined &&
      hypothesis !== undefined &&
      evaluation !== undefined);

  if (!hasContent && rollbackToStep === undefined) {
    throw new Error(
      'Either thought (or observation/hypothesis/evaluation) or rollback_to_step is required'
    );
  }

  const session = resolveSession(level, sessionId, query, targetThoughts);
  const config = getLevelConfig(session.level);
  const { totalThoughts } = session;

  return runWithContext(
    { sessionId: session.id, ...(abortSignal ? { abortSignal } : {}) },
    () =>
      withSessionLock(session.id, async () => {
        throwIfReasoningAborted(abortSignal);

        if (rollbackToStep !== undefined) {
          sessionStore.rollback(session.id, rollbackToStep);
        }

        const current = getSessionOrThrow(session.id);

        let content = thought;
        if (!content && observation) {
          content = `**Observation:** ${observation}\n\n**Hypothesis:** ${hypothesis ?? ''}\n\n**Evaluation:** ${evaluation ?? ''}`;
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
          await onProgress(addedThought.index + 1, totalThoughts);
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

  let release: (() => void) | undefined;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  const currentTail = previous.then(() => next);
  sessionLocks.set(sessionId, currentTail);

  await previous;
  try {
    return await fn();
  } finally {
    release?.();
    if (sessionLocks.get(sessionId) === currentTail) {
      sessionLocks.delete(sessionId);
    }
  }
}

function getSessionOrThrow(sessionId: string): Readonly<Session> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return session;
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
    throw new Error(
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
    const existing = sessionStore.get(sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    assertExistingSessionConstraints(existing, targetThoughts);
    return existing;
  }

  if (level === undefined) {
    throw new Error('level is required for new sessions');
  }

  const config = getLevelConfig(level);
  const totalThoughts = resolveThoughtCount(
    level,
    query,
    config,
    targetThoughts
  );
  const session = sessionStore.create(level, totalThoughts);
  engineEvents.emit('session:created', {
    sessionId: session.id,
    level,
  });
  return session;
}

function resolveThoughtCount(
  level: ReasoningLevel,
  query: string,
  config: Pick<LevelConfig, 'minThoughts' | 'maxThoughts'>,
  targetThoughts?: number
): number {
  if (targetThoughts !== undefined) {
    assertTargetThoughtsInRange(level, targetThoughts);
    return targetThoughts;
  }

  if (config.minThoughts === config.maxThoughts) {
    return config.minThoughts;
  }

  const queryText = query.trim();
  const span = config.maxThoughts - config.minThoughts;

  const queryByteLength = Buffer.byteLength(queryText, 'utf8');
  const lengthScore = Math.min(1, queryByteLength / 400);
  const structureScore = Math.min(0.4, getStructureDensityScore(queryText));
  const keywordScore = COMPLEXITY_KEYWORDS.test(queryText) ? 0.25 : 0;
  const score = Math.min(1, lengthScore + structureScore + keywordScore);

  return config.minThoughts + Math.round(span * score);
}

function countSentences(queryText: string): number {
  const segmenter = getSentenceSegmenter();
  if (!segmenter) {
    return 0;
  }

  let count = 0;
  for (const sentence of segmenter.segment(queryText)) {
    if (NON_WHITESPACE.test(sentence.segment)) {
      count++;
    }
  }
  return count;
}

function getStructureDensityScore(queryText: string): number {
  const sentenceCount = countSentences(queryText);
  if (sentenceCount > 1) {
    return (sentenceCount - 1) * 0.08;
  }

  let markerMatches = 0;
  for (let index = 0; index < queryText.length; index++) {
    switch (queryText.charCodeAt(index)) {
      case 63: // ?
      case 58: // :
      case 59: // ;
      case 44: // ,
      case 10: // \n
        markerMatches += 1;
        break;
      default:
        break;
    }
  }

  return markerMatches * 0.05;
}

function throwIfReasoningAborted(signal?: AbortSignal): void {
  if (!signal) {
    return;
  }
  try {
    signal.throwIfAborted();
  } catch {
    throw new Error('Reasoning aborted');
  }
}
