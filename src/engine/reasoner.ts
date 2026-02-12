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

        if (updated.thoughts.length >= totalThoughts) {
          sessionStore.markCompleted(session.id);
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
  const keywords =
    /\b(compare|analy[sz]e|trade[- ]?off|design|plan|critique|evaluate|review|architecture)\b/i;
  const keywordScore = keywords.test(queryText) ? 0.25 : 0;
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
const CONCLUSION_TEMPLATE =
  'Synthesizing the final answer with supporting evidence';

const CRITIQUE_TEMPLATES: readonly string[] = [
  'Critiquing the proposed solution for potential weaknesses',
  'Checking for missed edge cases or logical gaps',
  'Verifying alignment with original constraints',
  'Reviewing the reasoning path for redundant steps',
  'Assessing the robustness of the solution',
  'Identifying assumptions that require further verification',
  'Evaluating the solution against counter-arguments',
];

type Domain = 'CODE' | 'DESIGN' | 'ANALYSIS' | 'GENERAL';

const DOMAIN_TEMPLATES: Record<Domain, readonly string[]> = {
  CODE: [
    'Analyzing implementation details and logic',
    'Reviewing type safety and error handling',
    'Tracing data flow through the system',
    'Considering edge cases in input validation',
    'Checking for performance bottlenecks',
    'Validating against coding standards',
    'Reviewing dependencies and external interactions',
    'Assessing testability and maintainability',
    'Checking for concurrency or race conditions',
    'Verifying API contract compliance',
  ],
  DESIGN: [
    'Mapping component interactions and dependencies',
    'Evaluating architectural trade-offs',
    'Considering scalability and maintainability',
    'Checking system boundaries and interfaces',
    'Reviewing data models and schema',
    'Assessing failure modes and recovery',
    'Analyzing security implications',
    'Evaluating technology choices',
    'Considering future extensibility',
    'Reviewing compliance with design patterns',
  ],
  ANALYSIS: [
    'Identifying key metrics and indicators',
    'Comparing alternative approaches',
    'Checking for bias or gaps in data',
    'Validating assumptions against evidence',
    'Exploring causal relationships',
    'Synthesizing insights from multiple sources',
    'Weighing short-term vs long-term impacts',
    'Evaluating risks and mitigations',
    'Contextualizing findings within the broader scope',
    'Cross-checking conclusions for consistency',
  ],
  GENERAL: [
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
    'Weighing trade-offs between competing solutions',
    'Examining second-order effects and implications',
    'Refining the analysis with additional considerations',
    'Documenting key insights and decision points',
  ],
};

function detectDomain(query: string): Domain {
  const text = query.toLowerCase();

  if (
    /\b(code|function|bug|error|impl|script|typescript|python|js|ts|java|c\+\+|rust|api|endpoint)\b/.test(
      text
    )
  ) {
    return 'CODE';
  }
  if (
    /\b(design|architect|structure|pattern|system|component|module|interface|schema)\b/.test(
      text
    )
  ) {
    return 'DESIGN';
  }
  if (
    /\b(analy|compare|evaluate|assess|review|audit|investigate|study|research)\b/.test(
      text
    )
  ) {
    return 'ANALYSIS';
  }

  return 'GENERAL';
}

function generateReasoningStep(
  query: string,
  index: number,
  total: number
): string {
  if (total <= 0) {
    return '';
  }

  const step = index + 1;

  // Phase 1: Understanding (First Step)
  if (step === 1) {
    const truncatedQuery = truncate(query, 200, graphemeSegmenter);
    return formatStep(step, total, `${OPENING_TEMPLATE}: "${truncatedQuery}"`);
  }

  // Phase 4: Conclusion (Last Step)
  if (step === total) {
    return formatStep(step, total, CONCLUSION_TEMPLATE);
  }

  // Phase 3: Critique (Second-to-Last Step)
  if (total >= 4 && step === total - 1) {
    const critique =
      CRITIQUE_TEMPLATES[step % CRITIQUE_TEMPLATES.length] ??
      'Critiquing the proposed solution for potential weaknesses';
    return formatStep(step, total, critique);
  }

  // Phase 2: Domain-Specific Analysis (Middle Steps)
  const domain = detectDomain(query);
  const templates = DOMAIN_TEMPLATES[domain];

  const template =
    templates[(step - 2) % templates.length] ??
    templates[0] ??
    'Analyzing the problem';
  return formatStep(step, total, template);
}

function formatStep(step: number, total: number, description: string): string {
  return `Step ${String(step)}/${String(total)}: ${description}`;
}
