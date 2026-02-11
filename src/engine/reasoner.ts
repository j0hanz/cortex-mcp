import { Buffer } from 'node:buffer';

import type { ReasoningLevel, Session } from '../lib/types.js';

import { LEVEL_CONFIGS } from './config.js';
import { runWithContext } from './context.js';
import { engineEvents } from './events.js';
import { SessionStore } from './session-store.js';

const sessionStore = new SessionStore();

export { sessionStore };

export interface ReasonOptions {
  sessionId?: string;
  targetThoughts?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number, total: number) => void | Promise<void>;
}

export async function reason(
  query: string,
  level: ReasoningLevel,
  options?: ReasonOptions
): Promise<Session> {
  const { sessionId, targetThoughts, abortSignal, onProgress } = options ?? {};

  let session: Session;
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
  const markerMatches = queryText.match(/[?:;,\n]/g)?.length ?? 0;
  const markerScore = Math.min(0.4, markerMatches * 0.05);
  const keywordScore =
    /\b(compare|analy[sz]e|trade[- ]?off|design|plan)\b/i.test(queryText)
      ? 0.15
      : 0;
  const score = Math.min(1, lengthScore + markerScore + keywordScore);

  return config.minThoughts + Math.round(span * score);
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
  let current = '';
  let usedBytes = 0;

  for (const codePoint of str) {
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    if (usedBytes + codePointBytes > targetBytes) {
      break;
    }
    current += codePoint;
    usedBytes += codePointBytes;
  }

  return `${current}${suffix}`;
}
