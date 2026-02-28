import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  LoggingLevel,
  Task,
} from '@modelcontextprotocol/sdk/types.js';

import {
  getLevelDescriptionString,
  shouldRedactTraceContent,
} from '../engine/config.js';
import { reason, sessionStore } from '../engine/reasoner.js';

import {
  type ReasoningThinkInput,
  ReasoningThinkInputSchema,
} from '../schemas/inputs.js';
import {
  type ReasoningThinkSuccess,
  ReasoningThinkToolOutputSchema,
} from '../schemas/outputs.js';

import { createTaskLimiter } from '../lib/concurrency.js';
import {
  createErrorResponse,
  getErrorMessage,
  InsufficientThoughtsError,
  InvalidRunModeArgsError,
  ReasoningAbortedError,
  ReasoningError,
  ServerBusyError,
  SessionNotFoundError,
} from '../lib/errors.js';
import { formatProgressMessage } from '../lib/formatting.js';
import { notifyProgress, shouldEmitProgress } from '../lib/progress.js';
import { buildTraceResource } from '../lib/session-utils.js';
import type {
  CancellationController,
  ProgressToken,
  TaskContext,
  TaskStoreLike,
} from '../lib/task.js';
import { createToolResponse, withIconMeta } from '../lib/tool-response.js';
import type {
  IconMeta,
  ReasoningLevel,
  ReasoningRunMode,
  Session,
} from '../lib/types.js';
import { parsePositiveIntEnv } from '../lib/validators.js';

import {
  assertCallToolResult,
  assertReasoningTaskExtra,
} from './reasoning-validators.js';

const DEFAULT_MAX_ACTIVE_REASONING_TASKS = 32;

const reasoningTaskLimiter = createTaskLimiter(
  parsePositiveIntEnv(
    'CORTEX_MAX_ACTIVE_REASONING_TASKS',
    DEFAULT_MAX_ACTIVE_REASONING_TASKS
  )
);

function getReasoningErrorCode(error: unknown): string {
  if (error instanceof ReasoningError) {
    return error.code;
  }
  return 'E_REASONING';
}

function buildThoughtInputs(params: ReasoningThinkInput): string[] {
  const primary = Array.isArray(params.thought)
    ? params.thought
    : params.thought
      ? [params.thought]
      : [];
  return primary;
}

function getStartingThoughtCount(sessionId?: string): number {
  if (sessionId === undefined) {
    return 0;
  }
  return sessionStore.get(sessionId)?.thoughts.length ?? 0;
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

async function executeReasoningSteps(args: {
  taskStore: TaskStoreLike;
  taskId: string;
  controller: AbortController;
  queryText: string;
  level: ReasoningLevel | undefined;
  sessionId?: string;
  targetThoughts?: number;
  runMode: ReasoningRunMode;
  thoughtInputs: string[];
  onProgress: (
    progress: number,
    total: number,
    summary?: string
  ) => Promise<void>;
  observation?: string;
  hypothesis?: string;
  evaluation?: string;
  stepSummary?: string;
  isConclusion?: boolean;
  rollbackToStep?: number;
}): Promise<Readonly<Session>> {
  const {
    taskStore,
    taskId,
    controller,
    queryText,
    level,
    sessionId,
    targetThoughts,
    runMode,
    thoughtInputs,
    onProgress,
    observation,
    hypothesis,
    evaluation,
    stepSummary,
    isConclusion,
    rollbackToStep,
  } = args;

  let activeSessionId = sessionId;
  let session: Readonly<Session> | undefined;
  let maxSteps = runMode === 'step' ? 1 : thoughtInputs.length;

  if (
    maxSteps === 0 &&
    (observation ||
      hypothesis ||
      evaluation ||
      isConclusion ||
      rollbackToStep !== undefined)
  ) {
    maxSteps = 1;
  }

  // Build first-step-only extras once, outside the loop.
  const firstStepExtras = {
    ...(observation !== undefined ? { observation } : {}),
    ...(hypothesis !== undefined ? { hypothesis } : {}),
    ...(evaluation !== undefined ? { evaluation } : {}),
    ...(stepSummary !== undefined ? { stepSummary } : {}),
    ...(isConclusion !== undefined ? { isConclusion } : {}),
    ...(rollbackToStep !== undefined ? { rollbackToStep } : {}),
  };
  const baseOptions = {
    ...(targetThoughts !== undefined ? { targetThoughts } : {}),
    abortSignal: controller.signal,
    onProgress,
  };

  for (let index = 0; index < maxSteps; index++) {
    await ensureTaskIsActive(taskStore, taskId, controller);

    const inputThought = thoughtInputs[index];
    // Break if no thought and no structured input (only valid for first step if structured)
    if (
      inputThought === undefined &&
      (index > 0 ||
        (!observation &&
          !hypothesis &&
          !evaluation &&
          !isConclusion &&
          rollbackToStep === undefined))
    ) {
      break;
    }

    const reasonOptions = {
      ...baseOptions,
      ...(inputThought !== undefined ? { thought: inputThought } : {}),
      ...(activeSessionId !== undefined ? { sessionId: activeSessionId } : {}),
      ...(index === 0 ? firstStepExtras : {}),
    };

    session = await reason(queryText, level, reasonOptions);

    activeSessionId = session.id;
    if (shouldStopReasoningLoop(session, runMode)) {
      break;
    }
  }

  if (!session) {
    throw new Error('No reasoning step was executed.');
  }
  return session;
}

function buildStructuredResult(
  session: Readonly<Session>,
  generatedThoughts: number,
  targetThoughts: number | undefined
): ReasoningThinkSuccess {
  const ttlMs = sessionStore.getTtlMs();
  const expiresAt =
    sessionStore.getExpiresAt(session.id) ?? session.updatedAt + ttlMs;

  const requestedThoughts = targetThoughts ?? session.totalThoughts;
  const remainingThoughts = Math.max(
    0,
    session.totalThoughts - session.thoughts.length
  );

  return {
    ok: true,
    result: {
      sessionId: session.id,
      ...(session.query !== undefined ? { query: session.query } : {}),
      level: session.level,
      status: session.status,
      thoughts: [...session.thoughts],
      generatedThoughts,
      requestedThoughts,
      totalThoughts: session.totalThoughts,
      remainingThoughts,
      tokenBudget: session.tokenBudget,
      tokensUsed: session.tokensUsed,
      ttlMs,
      expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      summary: buildSummary(session, remainingThoughts),
    },
  };
}

function buildSummary(
  session: Readonly<Session>,
  remainingThoughts: number
): string {
  if (session.status === 'completed') {
    return `Reasoning complete — ${String(session.thoughts.length)} thought${session.thoughts.length === 1 ? '' : 's'} at [${session.level}] level. Session ${session.id}.`;
  }
  if (session.status === 'cancelled') {
    return `Reasoning cancelled at thought ${String(session.thoughts.length)}/${String(session.totalThoughts)}. Session ${session.id}.`;
  }

  const recentSummaries = session.thoughts
    .filter((t) => t.stepSummary)
    .slice(-3)
    .map((t) => `Step ${t.index + 1}: ${t.stepSummary ?? ''}`)
    .join('; ');
  const summaryText = recentSummaries
    ? `Summary so far: ${recentSummaries}. `
    : '';

  const progress = session.thoughts.length / session.totalThoughts;
  let prompt = 'Synthesize your findings toward a final conclusion.';
  if (progress < 0.3) {
    prompt = 'Focus on gathering facts and identifying unknowns.';
  } else if (progress < 0.7) {
    prompt = 'Formulate and critique hypotheses based on the facts.';
  }

  return (
    `CONTINUE: ${prompt} Call reasoning_think with { sessionId: "${session.id}", thought: "<your next reasoning step>" }. ` +
    `${summaryText}Progress: ${String(session.thoughts.length)}/${String(
      session.totalThoughts
    )} thoughts, ${String(remainingThoughts)} remaining.`
  );
}

async function emitLog(
  server: McpServer,
  level: LoggingLevel,
  data: Record<string, unknown>,
  sessionId?: string
): Promise<void> {
  try {
    await server.sendLoggingMessage(
      {
        level,
        logger: TOOL_NAME,
        data,
      },
      sessionId
    );
  } catch {
    // Logging should never fail a tool call.
  }
}

function createCancellationController(
  signal: AbortSignal
): CancellationController {
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort();
    return {
      controller,
      cleanup: () => {
        // No listener to clean up when already aborted.
      },
    };
  }

  const onAbort = (): void => {
    controller.abort();
  };
  const cleanup = (): void => {
    signal.removeEventListener('abort', onAbort);
  };

  signal.addEventListener('abort', onAbort, { once: true });
  controller.signal.addEventListener('abort', cleanup, { once: true });

  return { controller, cleanup };
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
  controller: AbortController
): Promise<void> {
  if (await isTaskCancelled(taskStore, taskId)) {
    controller.abort();
    throw new ReasoningAbortedError('Reasoning task cancelled');
  }
}

function createProgressHandler(args: {
  server: McpServer;
  taskStore: TaskStoreLike;
  taskId: string;
  level: ReasoningLevel | undefined;
  progressToken?: ProgressToken;
  controller: AbortController;
  startingCount: number;
  batchTotal: number;
}): (progress: number, total: number, summary?: string) => Promise<void> {
  const {
    server,
    taskStore,
    taskId,
    level,
    progressToken,
    controller,
    startingCount,
    batchTotal,
  } = args;

  return async (
    progress: number,
    _total: number,
    summary?: string
  ): Promise<void> => {
    await ensureTaskIsActive(taskStore, taskId, controller);

    if (progressToken === undefined) {
      return;
    }

    const currentBatchIndex = Math.max(0, progress - startingCount);
    // Ensure we don't exceed batchTotal for the progress bar (though technically logic shouldn't)
    const displayProgress = Math.min(currentBatchIndex, batchTotal);
    const isTerminal = displayProgress >= batchTotal;

    // We must emit if it's the terminal update for this batch,
    // otherwise we respect the session-level skipping rules.
    // If a summary is provided, we force an emit to show the meaningful update.
    if (
      !isTerminal &&
      !summary &&
      !shouldEmitProgress(displayProgress, batchTotal, level)
    ) {
      return;
    }

    const message = formatProgressMessage({
      toolName: `꩜ ${TOOL_NAME}`,
      context: 'Thought',
      ...(summary ? { metadata: summary } : {}),
      ...(isTerminal ? { outcome: 'complete' } : {}),
    });

    await notifyProgress({
      server,
      progressToken,
      progress: displayProgress,
      total: batchTotal,
      message,
    });
  };
}

async function storeTaskFailure(
  taskStore: TaskStoreLike,
  taskId: string,
  response: CallToolResult
): Promise<void> {
  try {
    await taskStore.storeTaskResult(taskId, 'failed', response);
  } catch {
    // No-op if the task has already reached a terminal state.
  }
}

async function setTaskFailureStatusMessage(
  taskStore: TaskStoreLike,
  taskId: string,
  statusMessage: string
): Promise<void> {
  try {
    await taskStore.updateTaskStatus(taskId, 'working', statusMessage);
  } catch {
    // No-op if task is already terminal.
  }
}

async function notifyTaskStatus(
  server: McpServer,
  taskId: string,
  status: 'completed' | 'failed'
): Promise<void> {
  try {
    await server.server.notification({
      method: 'notifications/tasks/status',
      params: { taskId, status },
    });
  } catch {
    // Notification failure must never fail the task operation.
  }
}

function assertRunToCompletionInputCount(
  params: ReasoningThinkInput,
  thoughtInputs: string[]
): void {
  const { sessionId, targetThoughts } = params;
  if (!sessionId && !targetThoughts) {
    throw new InvalidRunModeArgsError(
      'targetThoughts is required for run_to_completion when sessionId is not provided'
    );
  }

  let requiredInputs = targetThoughts ?? 0;
  if (sessionId) {
    const existing = sessionStore.get(sessionId);
    if (!existing) {
      throw new SessionNotFoundError(sessionId);
    }
    requiredInputs = Math.max(
      0,
      existing.totalThoughts - existing.thoughts.length
    );
  }

  if (thoughtInputs.length < requiredInputs) {
    throw new InsufficientThoughtsError(
      `run_to_completion requires at least ${String(
        requiredInputs
      )} thought inputs; received ${String(thoughtInputs.length)}`
    );
  }
}

function getActionableMessage(
  errorCode: string,
  originalMessage: string
): string {
  switch (errorCode) {
    case 'E_INVALID_THOUGHT_COUNT':
      return `${originalMessage} Fix: set targetThoughts within the level range (basic 1–3, normal 4–8, high 10–15, expert 20–25).`;
    case 'E_INSUFFICIENT_THOUGHTS':
      return `${originalMessage} Fix: provide enough thought inputs for the remaining steps, or use runMode: "step".`;
    case 'E_INVALID_RUN_MODE_ARGS':
      return `${originalMessage} Fix: set targetThoughts when starting a new session with runMode: "run_to_completion".`;
    default:
      return originalMessage;
  }
}

async function handleTaskFailure(args: {
  server: McpServer;
  taskStore: TaskStoreLike;
  taskId: string;
  sessionId?: string;
  error: unknown;
}): Promise<void> {
  const { server, taskStore, taskId, sessionId, error } = args;
  const originalMessage = getErrorMessage(error);
  const errorCode = getReasoningErrorCode(error);
  const message = getActionableMessage(errorCode, originalMessage);
  const response = createErrorResponse(errorCode, message);

  if (await isTaskCancelled(taskStore, taskId)) {
    if (sessionId) {
      sessionStore.markCancelled(sessionId);
    }
    await emitLog(
      server,
      'notice',
      { event: 'task_cancelled', taskId, reason: message },
      sessionId
    );
    return;
  }

  await setTaskFailureStatusMessage(taskStore, taskId, message);

  if (errorCode === 'E_ABORTED') {
    if (sessionId) {
      sessionStore.markCancelled(sessionId);
    }
    await storeTaskFailure(taskStore, taskId, response);
    await notifyTaskStatus(server, taskId, 'failed');
    await emitLog(
      server,
      'notice',
      { event: 'task_aborted', taskId, reason: message },
      sessionId
    );
    return;
  }

  await storeTaskFailure(taskStore, taskId, response);
  await notifyTaskStatus(server, taskId, 'failed');
  await emitLog(
    server,
    'error',
    { event: 'task_failed', taskId, code: errorCode, message },
    sessionId
  );
}

async function runReasoningTask(args: {
  server: McpServer;
  taskStore: TaskStoreLike;
  taskId: string;
  params: ReasoningThinkInput;
  progressToken?: ProgressToken;
  controller: AbortController;
  sessionId?: string;
}): Promise<void> {
  const {
    server,
    taskStore,
    taskId,
    params,
    progressToken,
    controller,
    sessionId,
  } = args;
  const { query, level, targetThoughts } = params;
  const runMode = params.runMode ?? 'step';
  const thoughtInputs = buildThoughtInputs(params);
  const queryText = query ?? '';
  let resolvedSessionId = params.sessionId ?? sessionId;

  await emitLog(
    server,
    'info',
    {
      event: 'task_started',
      taskId,
      level,
      runMode,
      hasSessionId: params.sessionId !== undefined,
      targetThoughts: targetThoughts ?? null,
      thoughtInputs: thoughtInputs.length,
    },
    resolvedSessionId
  );

  try {
    if (runMode === 'run_to_completion') {
      assertRunToCompletionInputCount(params, thoughtInputs);
    }

    const startingCount = getStartingThoughtCount(params.sessionId);

    let batchTotal = runMode === 'step' ? 1 : thoughtInputs.length;
    if (
      batchTotal === 0 &&
      (params.observation !== undefined ||
        params.hypothesis !== undefined ||
        params.evaluation !== undefined ||
        params.is_conclusion !== undefined ||
        params.rollback_to_step !== undefined)
    ) {
      batchTotal = 1;
    }

    const normalizedBatchTotal = Math.max(1, batchTotal);
    if (progressToken !== undefined) {
      const message = formatProgressMessage({
        toolName: `꩜ ${TOOL_NAME}`,
        context: level ? 'starting' : 'continuing',
        metadata: level ? `[${level}]` : 'session',
      });

      await notifyProgress({
        server,
        progressToken,
        progress: 0,
        total: normalizedBatchTotal,
        message,
      });
    }

    const progressArgs: Parameters<typeof createProgressHandler>[0] = {
      server,
      taskStore,
      taskId,
      level,
      controller,
      startingCount,
      batchTotal: normalizedBatchTotal,
    };
    if (progressToken !== undefined) {
      progressArgs.progressToken = progressToken;
    }
    const onProgress = createProgressHandler(progressArgs);
    const executeArgs: Parameters<typeof executeReasoningSteps>[0] = {
      taskStore,
      taskId,
      controller,
      queryText,
      level,
      runMode,
      thoughtInputs,
      onProgress,
    };
    if (params.sessionId !== undefined) {
      executeArgs.sessionId = params.sessionId;
    }
    if (targetThoughts !== undefined) {
      executeArgs.targetThoughts = targetThoughts;
    }
    if (params.observation !== undefined)
      executeArgs.observation = params.observation;
    if (params.hypothesis !== undefined)
      executeArgs.hypothesis = params.hypothesis;
    if (params.evaluation !== undefined)
      executeArgs.evaluation = params.evaluation;
    if (params.step_summary !== undefined)
      executeArgs.stepSummary = params.step_summary;
    if (params.is_conclusion !== undefined)
      executeArgs.isConclusion = params.is_conclusion;
    if (params.rollback_to_step !== undefined)
      executeArgs.rollbackToStep = params.rollback_to_step;

    const session = await executeReasoningSteps(executeArgs);
    resolvedSessionId = session.id;

    if (await isTaskCancelled(taskStore, taskId)) {
      sessionStore.markCancelled(resolvedSessionId);
      await emitLog(
        server,
        'notice',
        { event: 'task_cancelled_before_result', taskId },
        resolvedSessionId
      );
      return;
    }

    const generatedThoughts = Math.max(
      0,
      session.thoughts.length - startingCount
    );
    const result = buildStructuredResult(
      session,
      generatedThoughts,
      targetThoughts
    );

    await taskStore.storeTaskResult(
      taskId,
      'completed',
      createToolResponse(result, buildTraceResource(session, shouldRedactTraceContent()))
    );
    await notifyTaskStatus(server, taskId, 'completed');
    await emitLog(
      server,
      'info',
      {
        event: 'task_completed',
        taskId,
        sessionId: session.id,
        generatedThoughts,
        totalThoughts: session.thoughts.length,
      },
      resolvedSessionId
    );
  } catch (error) {
    const failureArgs: Parameters<typeof handleTaskFailure>[0] = {
      server,
      taskStore,
      taskId,
      error,
    };
    if (resolvedSessionId !== undefined) {
      failureArgs.sessionId = resolvedSessionId;
    }
    await handleTaskFailure(failureArgs);
  }
}

function getTaskId(extra: TaskContext): string {
  if (typeof extra.taskId !== 'string' || extra.taskId.length === 0) {
    throw new InvalidRunModeArgsError('Task ID missing in request context.');
  }
  return extra.taskId;
}

const TOOL_NAME = 'reasoning_think';

export function registerReasoningThinkTool(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  server.experimental.tasks.registerToolTask(
    TOOL_NAME,
    {
      title: 'Reasoning Think',
      description: `Structured multi-step reasoning tool. Decomposes analysis into sequential thought steps stored in a persistent session trace.

USAGE PATTERN:
1. Start: { query: "...", level: "basic"|"normal"|"high", thought: "your analysis..." }
2. Continue: { sessionId: "<from response>", thought: "next step..." } — level is optional; session level is used
3. Repeat until status: "completed" — the summary field contains the exact next call to make

IMPORTANT: Pass the returned sessionId on every continuation call.
The thought parameter stores YOUR reasoning verbatim — write thorough analysis in each step.
Use step_summary for a 1-sentence conclusion per step — these accumulate in the summary field for navigation.

Levels: ${getLevelDescriptionString()}.
Alternatives: runMode="run_to_completion" (batch), or observation/hypothesis/evaluation fields (structured).
Errors: E_SESSION_NOT_FOUND (expired — start new), E_INVALID_THOUGHT_COUNT (check level ranges).
Protocol validation: malformed task metadata/arguments fail at request level before task start; runtime reasoning failures return tool isError=true payloads.`,
      inputSchema: ReasoningThinkInputSchema,
      outputSchema: ReasoningThinkToolOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      execution: { taskSupport: 'optional' },
      ...(withIconMeta(iconMeta) ?? {}),
    },
    {
      async createTask(rawParams, rawExtra) {
        // Enforce fail-fast for budget before creating tasks if possible,
        // but session check requires sessionId which might not be present (new session).
        // So we rely on reason() logic.

        const parseResult = ReasoningThinkInputSchema.safeParse(rawParams);
        if (!parseResult.success) {
          throw new Error(
            `Invalid reasoning_think params: ${parseResult.error.message}`
          );
        }
        const params = parseResult.data;
        const extra = assertReasoningTaskExtra(rawExtra);
        const progressToken = extra._meta?.progressToken;

        if (!reasoningTaskLimiter.tryAcquire()) {
          throw new ServerBusyError();
        }

        let task: Task;
        try {
          task = await extra.taskStore.createTask({
            ttl: extra.taskRequestedTtl ?? null,
            pollInterval: 500,
          });
        } catch (error) {
          reasoningTaskLimiter.release();
          throw error;
        }

        const cancellation = createCancellationController(extra.signal);
        const runReasoningArgs: {
          server: McpServer;
          taskStore: TaskStoreLike;
          taskId: string;
          params: ReasoningThinkInput;
          progressToken?: ProgressToken;
          controller: AbortController;
          sessionId?: string;
        } = {
          server,
          taskStore: extra.taskStore,
          taskId: task.taskId,
          params,
          controller: cancellation.controller,
        };
        if (progressToken !== undefined) {
          runReasoningArgs.progressToken = progressToken;
        }
        if (extra.sessionId !== undefined) {
          runReasoningArgs.sessionId = extra.sessionId;
        }

        void runReasoningTask(runReasoningArgs).finally(() => {
          cancellation.cleanup();
          reasoningTaskLimiter.release();
        });

        return { task };
      },

      getTask(_params, rawExtra) {
        const extra = assertReasoningTaskExtra(rawExtra);
        return extra.taskStore.getTask(getTaskId(extra));
      },

      async getTaskResult(_params, rawExtra) {
        const extra = assertReasoningTaskExtra(rawExtra);
        const result = await extra.taskStore.getTaskResult(getTaskId(extra));
        assertCallToolResult(result);
        return result;
      },
    }
  );
}
