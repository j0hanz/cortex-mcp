import { Buffer } from 'node:buffer';

import type { ReasoningLevel, Session } from '../lib/types.js';

import { LEVEL_CONFIGS } from './config.js';
import { runWithContext } from './context.js';
import { engineEvents } from './events.js';
import { SessionStore } from './session-store.js';

const sessionStore = new SessionStore();
const graphemeSegmenter = createSegmenter('grapheme');
const sentenceSegmenter = createSegmenter('sentence');

export { sessionStore };

interface ReasonOptions {
  sessionId?: string;
  targetThoughts?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number, total: number) => void | Promise<void>;
}

export async function reason(
  query: string,
  level: ReasoningLevel,
  options?: ReasonOptions
): Promise<Readonly<Session>> {
  const { sessionId, targetThoughts, abortSignal, onProgress } = options ?? {};

  const session = resolveSession(level, sessionId);

  const config = LEVEL_CONFIGS[level];
  const totalThoughts = resolveThoughtCount(query, config, targetThoughts);

  return runWithContext(
    { sessionId: session.id, ...(abortSignal ? { abortSignal } : {}) },
    async () => {
      const checkAbort = (): void => {
        throwIfReasoningAborted(abortSignal);
      };

      checkAbort();
      const steps = generateReasoningSteps(query, totalThoughts);

      for (let i = 0; i < steps.length; i++) {
        checkAbort();

        const stepContent = steps[i];
        if (!stepContent) throw new Error('Step content missing');

        const thought = sessionStore.addThought(session.id, stepContent);
        engineEvents.emit('thought:added', {
          sessionId: session.id,
          index: thought.index,
          content: thought.content,
        });

        // Stop generating if the token budget has been exhausted.
        const current = sessionStore.get(session.id);
        if (current && current.tokensUsed >= config.tokenBudget) {
          if (onProgress) {
            await onProgress(i + 1, totalThoughts);
          }
          break;
        }

        if (onProgress) {
          await onProgress(i + 1, totalThoughts);
          checkAbort();
        }
      }

      const result = sessionStore.get(session.id);
      if (!result) throw new Error(`Session not found: ${session.id}`);
      return result;
    }
  );
}

function resolveSession(
  level: ReasoningLevel,
  sessionId?: string
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
    return existing;
  }

  const session = sessionStore.create(level);
  engineEvents.emit('session:created', {
    sessionId: session.id,
    level,
  });
  return session;
}

function resolveThoughtCount(
  query: string,
  config: { minThoughts: number; maxThoughts: number },
  targetThoughts?: number
): number {
  if (targetThoughts !== undefined) {
    if (!Number.isInteger(targetThoughts)) {
      throw new Error('targetThoughts must be an integer');
    }
    if (
      targetThoughts < config.minThoughts ||
      targetThoughts > config.maxThoughts
    ) {
      throw new Error(
        `targetThoughts must be between ${String(config.minThoughts)} and ${String(config.maxThoughts)} for the selected level`
      );
    }
    return targetThoughts;
  }

  if (config.minThoughts === config.maxThoughts) {
    return config.minThoughts;
  }

  const queryText = query.trim();
  const span = config.maxThoughts - config.minThoughts;

  // Heuristic: longer and more structurally complex prompts get deeper reasoning.
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

function createSegmenter(
  granularity: 'grapheme' | 'sentence'
): Intl.Segmenter | undefined {
  if (typeof Intl !== 'object' || typeof Intl.Segmenter !== 'function') {
    return undefined;
  }
  try {
    return new Intl.Segmenter(undefined, { granularity });
  } catch {
    return undefined;
  }
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
function generateReasoningSteps(query: string, count: number): string[] {
  if (count <= 0) return [];

  const steps: string[] = [];
  const truncatedQuery = truncate(query, 200);

  steps.push(formatStep(1, count, `${OPENING_TEMPLATE}: "${truncatedQuery}"`));

  if (count <= 1) return steps;

  const middleCount = count - 2;
  for (let i = 0; i < middleCount; i++) {
    const template = MIDDLE_TEMPLATES[i % MIDDLE_TEMPLATES.length] ?? '';
    steps.push(formatStep(i + 2, count, template));
  }

  steps.push(formatStep(count, count, CONCLUSION_TEMPLATE));

  return steps;
}

function formatStep(step: number, total: number, description: string): string {
  return `Step ${String(step)}/${String(total)}: ${description}`;
}

function truncate(str: string, maxLength: number): string {
  const suffix = '...';
  const maxBytes = Math.max(0, maxLength);
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');

  if (Buffer.byteLength(str, 'utf8') <= maxBytes) {
    return str;
  }
  if (maxBytes <= suffixBytes) {
    return suffix.slice(0, maxBytes);
  }

  const targetBytes = maxBytes - suffixBytes;
  const truncated = truncateByGrapheme(str, targetBytes);
  return truncated + suffix;
}

function truncateByGrapheme(str: string, maxBytes: number): string {
  if (!graphemeSegmenter) {
    return truncateByUtf8Boundary(str, maxBytes);
  }

  let result = '';
  let usedBytes = 0;
  for (const part of graphemeSegmenter.segment(str)) {
    const segmentBytes = Buffer.byteLength(part.segment, 'utf8');
    if (usedBytes + segmentBytes > maxBytes) {
      break;
    }
    result += part.segment;
    usedBytes += segmentBytes;
  }

  return result;
}

function truncateByUtf8Boundary(str: string, maxBytes: number): string {
  const safeMaxBytes = Math.max(0, maxBytes);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= safeMaxBytes) {
    return str;
  }
  if (safeMaxBytes === 0) {
    return '';
  }

  // Backtrack to find a clean cut point for UTF-8
  let end = safeMaxBytes;
  while (end > 0) {
    const byte = encoded[end - 1];
    if (byte === undefined || (byte & 0xc0) !== 0x80) {
      break;
    }
    end--;
  }

  // If we landed on a start byte, check if the sequence is complete
  if (end > 0) {
    const lastByte = encoded[end - 1];
    if (lastByte !== undefined) {
      const charBytes = getUtf8CharLength(lastByte);
      const available = safeMaxBytes - (end - 1);
      if (available < charBytes) {
        end--; // Incomplete character, drop it
      } else {
        end = safeMaxBytes; // Complete character, restore full length
      }
    }
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(encoded.subarray(0, end));
}

function getUtf8CharLength(byte: number): number {
  if ((byte & 0xe0) === 0xc0) return 2;
  if ((byte & 0xf0) === 0xe0) return 3;
  if ((byte & 0xf8) === 0xf0) return 4;
  return 1;
}
