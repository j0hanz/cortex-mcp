import { Buffer } from 'node:buffer';

import { createSegmenter, truncate } from '../lib/text.js';
import type { ReasoningLevel, Session } from '../lib/types.js';

import { assertTargetThoughtsInRange, LEVEL_CONFIGS } from './config.js';
import { runWithContext } from './context.js';
import { engineEvents } from './events.js';
import { SessionStore } from './session-store.js';

const sessionStore = new SessionStore();
const graphemeSegmenter = createSegmenter('grapheme');
const sentenceSegmenter = createSegmenter('sentence');

const sessionLocks = new Map<string, Promise<void>>();

export { sessionStore };

interface ReasonOptions {
  sessionId?: string;
  targetThoughts?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number, total: number) => void | Promise<void>;
}

interface LevelConfig {
  minThoughts: number;
  maxThoughts: number;
  tokenBudget: number;
}

export async function reason(
  query: string,
  level: ReasoningLevel,
  options?: ReasonOptions
): Promise<Readonly<Session>> {
  const { sessionId, targetThoughts, abortSignal, onProgress } = options ?? {};

  const config = LEVEL_CONFIGS[level];
  const session = resolveSession(
    level,
    sessionId,
    query,
    config,
    targetThoughts
  );
  const { totalThoughts } = session;

  return runWithContext(
    { sessionId: session.id, ...(abortSignal ? { abortSignal } : {}) },
    () =>
      withSessionLock(session.id, async () => {
        throwIfReasoningAborted(abortSignal);

        const current = getSessionOrThrow(session.id);
        if (current.tokensUsed >= config.tokenBudget) {
          emitBudgetExhausted({
            sessionId: session.id,
            tokensUsed: current.tokensUsed,
            tokenBudget: config.tokenBudget,
            generatedThoughts: 0,
            requestedThoughts: totalThoughts,
          });
          return current;
        }

        const nextIndex = current.thoughts.length;
        if (nextIndex >= totalThoughts) {
          return current;
        }

        const stepContent = generateReasoningStep(
          query,
          nextIndex,
          totalThoughts
        );
        if (!stepContent) {
          throw new Error(
            `Step content missing at index ${String(nextIndex)}/${String(
              totalThoughts
            )}`
          );
        }

        const thought = sessionStore.addThought(session.id, stepContent);
        engineEvents.emit('thought:added', {
          sessionId: session.id,
          index: thought.index,
          content: thought.content,
        });

        const updated = getSessionOrThrow(session.id);
        if (updated.tokensUsed >= config.tokenBudget) {
          emitBudgetExhausted({
            sessionId: session.id,
            tokensUsed: updated.tokensUsed,
            tokenBudget: config.tokenBudget,
            generatedThoughts: thought.index + 1,
            requestedThoughts: totalThoughts,
          });
        }

        if (onProgress) {
          await onProgress(thought.index + 1, totalThoughts);
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

function emitBudgetExhausted(data: {
  sessionId: string;
  tokensUsed: number;
  tokenBudget: number;
  generatedThoughts: number;
  requestedThoughts: number;
}): void {
  engineEvents.emit('thought:budget-exhausted', data);
}

function resolveSession(
  level: ReasoningLevel,
  sessionId: string | undefined,
  query: string,
  config: LevelConfig,
  targetThoughts?: number
): Readonly<Session> {
  if (sessionId) {
    const existing = sessionStore.get(sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (existing.level !== level) {
      throw new Error(
        `Session level mismatch: requested ${level}, existing ${existing.level}`
      );
    }
    if (
      targetThoughts !== undefined &&
      targetThoughts !== existing.totalThoughts
    ) {
      throw new Error(
        `targetThoughts must be ${String(
          existing.totalThoughts
        )} for the existing session`
      );
    }
    return existing;
  }

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
  const keywordScore =
    /\b(compare|analy[sz]e|trade[- ]?off|design|plan)\b/i.test(queryText)
      ? 0.15
      : 0;
  const score = Math.min(1, lengthScore + structureScore + keywordScore);

  return config.minThoughts + Math.round(span * score);
}

function countSentences(queryText: string): number {
  if (!sentenceSegmenter) {
    return 0;
  }

  let count = 0;
  for (const sentence of sentenceSegmenter.segment(queryText)) {
    if (sentence.segment.trim().length > 0) {
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

  const markerMatches = queryText.match(/[?:;,\n]/g)?.length ?? 0;
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

const OPENING_TEMPLATE = 'Parsing the query and identifying the core problem';

const MIDDLE_TEMPLATES: readonly string[] = [
  'Identifying key components and constraints',
  'Breaking down the problem into sub-problems',
  'Mapping relationships between identified components',
  'Considering edge cases and boundary conditions',
  'Surveying the problem space for hidden assumptions',
  'Clarifying ambiguous terms and scoping the question',
  'Evaluating potential approaches and methodologies',
  'Selecting the most promising approach based on trade-offs',
  'Developing the solution framework step by step',
  'Checking logical consistency of intermediate conclusions',
  'Exploring alternative perspectives on the problem',
  'Assessing confidence levels in preliminary findings',
  'Identifying assumptions that require verification',
  'Weighing trade-offs between competing solutions',
  'Testing preliminary results against known constraints',
  'Examining second-order effects and implications',
  'Synthesizing findings from multiple angles of analysis',
  'Cross-referencing conclusions with initial premises',
  'Refining the analysis with additional considerations',
  'Validating the complete reasoning chain for coherence',
  'Optimizing the reasoning path for gaps or redundancies',
  'Reviewing the logical flow from premises to conclusion',
  'Documenting key insights and decision points',
];

const CONCLUSION_TEMPLATE =
  'Consolidating the final answer with supporting evidence';
function generateReasoningStep(
  query: string,
  index: number,
  total: number
): string {
  if (total <= 0) {
    return '';
  }

  const step = index + 1;
  if (step === 1) {
    const truncatedQuery = truncate(query, 200, graphemeSegmenter);
    return formatStep(step, total, `${OPENING_TEMPLATE}: "${truncatedQuery}"`);
  }

  if (step === total) {
    return formatStep(step, total, CONCLUSION_TEMPLATE);
  }

  const template = MIDDLE_TEMPLATES[(step - 2) % MIDDLE_TEMPLATES.length] ?? '';
  return formatStep(step, total, template);
}

function formatStep(step: number, total: number, description: string): string {
  return `Step ${String(step)}/${String(total)}: ${description}`;
}
