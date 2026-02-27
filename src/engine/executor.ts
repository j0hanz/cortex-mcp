import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ReasoningAbortedError } from '../lib/errors.js';
import { notifyProgress, shouldEmitProgress } from '../lib/progress.js';
import type { ProgressToken, TaskStoreLike } from '../lib/task.js';
import type {
  ReasoningLevel,
  ReasoningRunMode,
  Session,
} from '../lib/types.js';

import { reason } from './reasoner.js';

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

function buildThoughtInputs(thought?: string | string[]): string[] {
  if (thought === undefined) {
    return [];
  }
  return Array.isArray(thought) ? thought : [thought];
}

function shouldStopReasoningLoop(
  session: Readonly<Session>,
  runMode: ReasoningRunMode
): boolean {
  return (
    runMode === 'step' ||
    session.status !== 'active' ||
    session.thoughts.length >= session.totalThoughts ||
    session.tokensUsed >= session.tokenBudget
  );
}

async function isTaskCancelled(
  taskStore: TaskStoreLike,
  taskId: string
): Promise<boolean> {
  try {
    const task = await taskStore.getTask(taskId);
    return task.status === 'cancelled';
  } catch {
    return false;
  }
}

async function ensureTaskIsActive(
  taskStore: TaskStoreLike,
  taskId: string,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) {
    throw new ReasoningAbortedError('Reasoning task aborted');
  }
  if (await isTaskCancelled(taskStore, taskId)) {
    throw new ReasoningAbortedError('Reasoning task cancelled');
  }
}

export async function executeReasoningSteps(args: {
  taskStore: TaskStoreLike;
  taskId: string;
  sessionId: string | undefined;
  runMode: ReasoningRunMode;
  targetThoughts?: number | undefined;
  thought?: string | string[] | undefined;
  observation?: string | undefined;
  hypothesis?: string | undefined;
  evaluation?: string | undefined;
  stepSummary?: string | undefined;
  isConclusion?: boolean | undefined;
  rollbackToStep?: number | undefined;
  signal: AbortSignal;
  progressToken?: ProgressToken | undefined;
  server: McpServer;
  level?: ReasoningLevel | undefined;
  query?: string | undefined;
}): Promise<Readonly<Session>> {
  const {
    taskStore,
    taskId,
    sessionId: initialSessionId,
    runMode,
    targetThoughts,
    thought,
    observation,
    hypothesis,
    evaluation,
    stepSummary,
    isConclusion,
    rollbackToStep,
    signal,
    progressToken,
    server,
    level,
    query,
  } = args;

  let currentSessionId = initialSessionId;
  const thoughts = buildThoughtInputs(thought);
  let session: Readonly<Session> | undefined;

  const iterations = Math.max(1, thoughts.length);

  for (let i = 0; i < iterations; i++) {
    await ensureTaskIsActive(taskStore, taskId, signal);

    const currentThought = thoughts[i];
    const isLast = i === iterations - 1;

    const stepArgs: ReasonOptions = {
      abortSignal: signal,
      onProgress: async (p: number, t: number, s?: string) => {
        if (progressToken) {
          await ensureTaskIsActive(taskStore, taskId, signal);
          const currentLevel = session?.level ?? level;
          if (shouldEmitProgress(p, t, currentLevel)) {
            await notifyProgress({
              server,
              progressToken,
              progress: p,
              total: t,
              message: s ? `Step ${p}: ${s}` : `Reasoning step ${p}/${t}`,
            });
          }
        }
      },
    };

    if (currentSessionId !== undefined) {
      stepArgs.sessionId = currentSessionId;
    }
    if (targetThoughts !== undefined) {
      stepArgs.targetThoughts = targetThoughts;
    }
    if (currentThought !== undefined) {
      stepArgs.thought = currentThought;
    }

    if (isLast) {
      if (observation !== undefined) {
        stepArgs.observation = observation;
      }
      if (hypothesis !== undefined) {
        stepArgs.hypothesis = hypothesis;
      }
      if (evaluation !== undefined) {
        stepArgs.evaluation = evaluation;
      }
      if (stepSummary !== undefined) {
        stepArgs.stepSummary = stepSummary;
      }
      if (isConclusion !== undefined) {
        stepArgs.isConclusion = isConclusion;
      }
      if (rollbackToStep !== undefined) {
        stepArgs.rollbackToStep = rollbackToStep;
      }
    }

    session = await reason(query ?? '', level, stepArgs);

    currentSessionId = session.id;

    if (shouldStopReasoningLoop(session, runMode)) {
      break;
    }
  }

  if (!session) {
    throw new Error('No reasoning step was executed.');
  }

  return session;
}
