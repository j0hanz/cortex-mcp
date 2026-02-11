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

  let session: Readonly<Session>;
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
    session = existing;
  } else {
    session = sessionStore.create(level);
    engineEvents.emit('session:created', {
      sessionId: session.id,
      level,
    });
  }

  const config = LEVEL_CONFIGS[level];
  const totalThoughts = resolveThoughtCount(query, config, targetThoughts);

  return runWithContext(
    { sessionId: session.id, ...(abortSignal ? { abortSignal } : {}) },
    async () => {
      throwIfReasoningAborted(abortSignal);
      const steps = generateReasoningSteps(query, totalThoughts);

      for (let i = 0; i < steps.length; i++) {
        throwIfReasoningAborted(abortSignal);

        const stepContent = steps[i];
        if (!stepContent) throw new Error('Step content missing');
        const thought = sessionStore.addThought(session.id, stepContent);

        engineEvents.emit('thought:added', {
          sessionId: session.id,
          index: thought.index,
          content: thought.content,
        });

        if (onProgress) {
          await onProgress(i + 1, totalThoughts);
          throwIfReasoningAborted(abortSignal);
        }
      }

      const result = sessionStore.get(session.id);
      if (!result) {
        throw new Error(`Session not found: ${session.id}`);
      }
      return result;
    }
  );
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

function generateReasoningSteps(query: string, count: number): string[] {
  const steps: string[] = [];
  const templates = [
    `Understanding the problem: "${truncate(query, 200)}"`,
    `Identifying key components and constraints in the query`,
    `Breaking down the problem into sub-problems`,
    `Analyzing relationships between identified components`,
    `Considering edge cases and boundary conditions`,
    `Evaluating potential approaches and methodologies`,
    `Selecting the most promising approach based on analysis`,
    `Developing the solution framework step by step`,
    `Validating intermediate results against requirements`,
    `Checking logical consistency of the reasoning chain`,
    `Refining the analysis with additional considerations`,
    `Exploring alternative perspectives on the problem`,
    `Synthesizing findings from multiple angles`,
    `Evaluating trade-offs between competing solutions`,
    `Assessing confidence levels in preliminary conclusions`,
    `Identifying assumptions that need verification`,
    `Testing the solution against known constraints`,
    `Optimizing the reasoning path for completeness`,
    `Cross-referencing conclusions with initial premises`,
    `Performing final validation of the complete analysis`,
    `Preparing a comprehensive summary of findings`,
    `Documenting key insights and decision points`,
    `Reviewing the logical flow from premises to conclusion`,
    `Consolidating the final answer with supporting evidence`,
    `Concluding the analysis with actionable recommendations`,
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length] ?? '';
    steps.push(`Step ${String(i + 1)}/${String(count)}: ${template}`);
  }

  return steps;
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
