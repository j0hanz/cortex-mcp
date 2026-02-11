import type { ReasoningLevel, Session } from '../lib/types.js';

import { LEVEL_CONFIGS } from './config.js';
import { runWithContext } from './context.js';
import { engineEvents } from './events.js';
import { SessionStore } from './session-store.js';

const sessionStore = new SessionStore();

export { sessionStore };

export interface ReasonOptions {
  sessionId?: string;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number, total: number) => void | Promise<void>;
}

export async function reason(
  query: string,
  level: ReasoningLevel,
  options?: ReasonOptions
): Promise<Session> {
  const { sessionId, abortSignal, onProgress } = options ?? {};

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
  const totalThoughts = config.maxThoughts;

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
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength - 3)}...`;
}
