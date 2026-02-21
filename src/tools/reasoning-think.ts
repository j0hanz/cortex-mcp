import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  LoggingLevel,
  Task,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

import { getLevelDescriptionString } from '../engine/config.js';
import { reason, sessionStore } from '../engine/reasoner.js';

import {
  type ReasoningThinkInput,
  ReasoningThinkInputSchema,
} from '../schemas/inputs.js';
import { ReasoningThinkToolOutputSchema } from '../schemas/outputs.js';

import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { formatThoughtsToMarkdown } from '../lib/formatting.js';
import { createToolResponse } from '../lib/tool-response.js';
import type {
  IconMeta,
  ReasoningLevel,
  ReasoningRunMode,
  Session,
} from '../lib/types.js';

type ProgressToken = string | number;
const DEFAULT_MAX_ACTIVE_REASONING_TASKS = 32;
// Use explicit server busy error code for better client handling
const TASK_OVERLOAD_MESSAGE = 'Server busy: too many active reasoning tasks';

interface TaskStoreLike {
  createTask(options: {
    ttl?: number | null;
    pollInterval?: number;
  }): Promise<Task>;
  getTask(taskId: string): Promise<Task>;
  storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: CallToolResult
  ): Promise<void>;
  updateTaskStatus(
    taskId: string,
    status: Task['status'],
    statusMessage?: string
  ): Promise<void>;
  getTaskResult(taskId: string): Promise<unknown>;
}

interface ReasoningTaskExtra {
  signal: AbortSignal;
  sessionId?: string;
  taskId?: string;
  taskRequestedTtl?: number | null;
  taskStore: TaskStoreLike;
  _meta?: { progressToken?: ProgressToken } & Record<string, unknown>;
}

interface ReasoningStructuredResult {
  [key: string]: unknown;
  ok: true;
  result: {
    sessionId: string;
    level: ReasoningLevel;
    status: 'active' | 'completed' | 'cancelled';
    thoughts: readonly { index: number; content: string; revision: number }[];
    generatedThoughts: number;
    requestedThoughts: number;
    totalThoughts: number;
    remainingThoughts: number;
    tokenBudget: number;
    tokensUsed: number;
    ttlMs: number;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
    summary: string;
  };
}

function buildTraceResource(session: Readonly<Session>): TextResourceContents {
  return {
    uri: `file:///cortex/sessions/${session.id}/trace.md`,
    mimeType: 'text/markdown',
    text: formatThoughtsToMarkdown(session),
  };
}

function parsePositiveInt(
  rawValue: string | undefined,
  fallbackValue: number
): number {
  if (rawValue === undefined) {
    return fallbackValue;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallbackValue;
  }
  return parsed;
}

function createTaskLimiter(maxActiveTasks: number): {
  tryAcquire: () => boolean;
  release: () => void;
} {
  let activeTasks = 0;
  return {
    tryAcquire(): boolean {
      if (activeTasks >= maxActiveTasks) {
        return false;
      }
      activeTasks += 1;
      return true;
    },
    release(): void {
      if (activeTasks > 0) {
        activeTasks -= 1;
      }
    },
  };
}

const reasoningTaskLimiter = createTaskLimiter(
  parsePositiveInt(
    process.env.CORTEX_MAX_ACTIVE_REASONING_TASKS,
    DEFAULT_MAX_ACTIVE_REASONING_TASKS
  )
);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTaskStoreLike(value: unknown): value is TaskStoreLike {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.createTask === 'function' &&
    typeof value.getTask === 'function' &&
    typeof value.storeTaskResult === 'function' &&
    typeof value.updateTaskStatus === 'function' &&
    typeof value.getTaskResult === 'function'
  );
}

function isAbortSignalLike(value: unknown): value is AbortSignal {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.aborted === 'boolean' &&
    typeof value.addEventListener === 'function' &&
    typeof value.removeEventListener === 'function'
  );
}

function isProgressToken(value: unknown): value is ProgressToken {
  return typeof value === 'string' || typeof value === 'number';
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isReasoningTaskExtra(value: unknown): value is ReasoningTaskExtra {
  if (!isObjectRecord(value)) {
    return false;
  }
  if (!isTaskStoreLike(value.taskStore) || !isAbortSignalLike(value.signal)) {
    return false;
  }
  if (value.sessionId !== undefined && typeof value.sessionId !== 'string') {
    return false;
  }
  if (value.taskId !== undefined && typeof value.taskId !== 'string') {
    return false;
  }
  if (
    value.taskRequestedTtl !== undefined &&
    value.taskRequestedTtl !== null &&
    !isFiniteNonNegativeNumber(value.taskRequestedTtl)
  ) {
    return false;
  }
  if (value._meta !== undefined) {
    if (!isObjectRecord(value._meta)) {
      return false;
    }
    const { progressToken } = value._meta;
    if (progressToken !== undefined && !isProgressToken(progressToken)) {
      return false;
    }
  }
  return true;
}

function parseReasoningTaskExtra(rawExtra: unknown): ReasoningTaskExtra {
  if (!isReasoningTaskExtra(rawExtra)) {
    throw new Error('Invalid task context in request handler.');
  }
  return rawExtra;
}

function isContentBlockLike(value: unknown): boolean {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'text') {
    return typeof value.text === 'string';
  }

  if (value.type === 'resource') {
    return isObjectRecord(value.resource);
  }

  return true;
}

function isCallToolResult(value: unknown): value is CallToolResult {
  if (!isObjectRecord(value) || !Array.isArray(value.content)) {
    return false;
  }

  if (!value.content.every((entry) => isContentBlockLike(entry))) {
    return false;
  }

  if (value.isError !== undefined && typeof value.isError !== 'boolean') {
    return false;
  }

  return true;
}

function assertCallToolResult(value: unknown): asserts value is CallToolResult {
  if (!isCallToolResult(value)) {
    throw new Error('Stored task result is not a valid CallToolResult.');
  }
}

function mapReasoningErrorCode(message: string): string {
  switch (true) {
    case message === 'Reasoning aborted':
    case message === 'Reasoning task cancelled':
      return 'E_ABORTED';
    case message.startsWith('targetThoughts must be'):
    case message.startsWith('Cannot change targetThoughts'):
      return 'E_INVALID_THOUGHT_COUNT';
    case message.startsWith('Session not found:'):
      return 'E_SESSION_NOT_FOUND';
    case message.startsWith('Session level mismatch:'):
      return 'E_SESSION_LEVEL_MISMATCH';
    case message.startsWith('run_to_completion requires at least'):
      return 'E_INSUFFICIENT_THOUGHTS';
    case message.startsWith(
      'targetThoughts is required for run_to_completion when sessionId is not provided'
    ):
      return 'E_INVALID_RUN_MODE_ARGS';
    case message === TASK_OVERLOAD_MESSAGE:
      return 'E_SERVER_BUSY';
    default:
      return 'E_REASONING';
  }
}

function shouldEmitProgress(
  progress: number,
  total: number,
  level: ReasoningLevel | undefined
): boolean {
  if (progress <= 1 || progress >= total) {
    return true;
  }
  // High level: emit every 2 steps to reduce noise
  if (level === 'high') {
    return progress % 2 === 0;
  }
  // Basic/Normal: emit every step
  return true;
}

function resolveRunMode(params: ReasoningThinkInput): ReasoningRunMode {
  return params.runMode ?? 'step';
}

function buildThoughtInputs(params: ReasoningThinkInput): string[] {
  const primary = Array.isArray(params.thought)
    ? params.thought
    : params.thought
      ? [params.thought]
      : [];
  return [...primary, ...(params.thoughts ?? [])];
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
  onProgress: (progress: number, total: number) => Promise<void>;
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

    const reasonOptions: {
      sessionId?: string;
      targetThoughts?: number;
      thought?: string;
      abortSignal: AbortSignal;
      onProgress: (progress: number, total: number) => Promise<void>;
      observation?: string;
      hypothesis?: string;
      evaluation?: string;
      stepSummary?: string;
      isConclusion?: boolean;
      rollbackToStep?: number;
    } = {
      ...(inputThought !== undefined ? { thought: inputThought } : {}),
      abortSignal: controller.signal,
      onProgress,
    };

    if (index === 0) {
      if (observation !== undefined) reasonOptions.observation = observation;
      if (hypothesis !== undefined) reasonOptions.hypothesis = hypothesis;
      if (evaluation !== undefined) reasonOptions.evaluation = evaluation;
      if (stepSummary !== undefined) reasonOptions.stepSummary = stepSummary;
      if (isConclusion !== undefined) reasonOptions.isConclusion = isConclusion;
      if (rollbackToStep !== undefined)
        reasonOptions.rollbackToStep = rollbackToStep;
    }

    if (activeSessionId !== undefined) {
      reasonOptions.sessionId = activeSessionId;
    }
    if (targetThoughts !== undefined) {
      reasonOptions.targetThoughts = targetThoughts;
    }

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
): ReasoningStructuredResult {
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
      level: session.level,
      status: session.status,
      thoughts: session.thoughts,
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
    return `Reasoning complete. ${String(session.thoughts.length)} thoughts produced at level "${session.level}". Session ${session.id}.`;
  }
  if (session.status === 'cancelled') {
    return `Session cancelled at thought ${String(session.thoughts.length)}/${String(session.totalThoughts)}. Session ${session.id}.`;
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
    `CONTINUE: ${prompt} Call reasoning_think with { sessionId: "${session.id}", level: "${session.level}", thought: "<your next reasoning step>" }. ` +
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

function createCancellationController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort();
    return controller;
  }

  const onAbort = (): void => {
    controller.abort();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  controller.signal.addEventListener(
    'abort',
    () => {
      signal.removeEventListener('abort', onAbort);
    },
    { once: true }
  );
  return controller;
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
    throw new Error('Reasoning task cancelled');
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
}): (progress: number, total: number) => Promise<void> {
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

  return async (progress: number, total: number): Promise<void> => {
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
    if (!isTerminal && !shouldEmitProgress(progress, total, level)) {
      return;
    }

    try {
      await server.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: displayProgress,
          total: batchTotal,
          message: `𖦹 Thought [${String(progress)}/${String(total)}]`,
        },
      });
    } catch {
      // Ignore notification errors
    }
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
  if (sessionId === undefined && targetThoughts === undefined) {
    throw new Error(
      'targetThoughts is required for run_to_completion when sessionId is not provided'
    );
  }

  let requiredInputs = targetThoughts ?? 0;
  if (sessionId !== undefined) {
    const existing = sessionStore.get(sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    requiredInputs = Math.max(
      0,
      existing.totalThoughts - existing.thoughts.length
    );
  }

  if (thoughtInputs.length < requiredInputs) {
    throw new Error(
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
    case 'E_SESSION_LEVEL_MISMATCH':
      return `${originalMessage} ACTION REQUIRED: Re-call reasoning_think with the correct level matching the session.`;
    case 'E_INVALID_THOUGHT_COUNT':
      return `${originalMessage} ACTION REQUIRED: Ensure targetThoughts is within the level's range.`;
    case 'E_INSUFFICIENT_THOUGHTS':
      return `${originalMessage} ACTION REQUIRED: Provide enough thoughts for run_to_completion or switch to step mode.`;
    case 'E_INVALID_RUN_MODE_ARGS':
      return `${originalMessage} ACTION REQUIRED: Provide targetThoughts when starting a new session in run_to_completion mode.`;
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
  const errorCode = mapReasoningErrorCode(originalMessage);
  const message = getActionableMessage(errorCode, originalMessage);
  const response = createErrorResponse(errorCode, message);

  if (await isTaskCancelled(taskStore, taskId)) {
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
  const runMode = resolveRunMode(params);
  const thoughtInputs = buildThoughtInputs(params);
  const queryText = query ?? '';

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
    sessionId
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

    if (progressToken !== undefined) {
      try {
        await server.server.notification({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: 0,
            total: Math.max(1, batchTotal),
            message: 'Starting reasoning...',
          },
        });
      } catch {
        // Ignore notification errors
      }
    }

    const progressArgs: Parameters<typeof createProgressHandler>[0] = {
      server,
      taskStore,
      taskId,
      level,
      controller,
      startingCount,
      batchTotal: Math.max(1, batchTotal),
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

    if (await isTaskCancelled(taskStore, taskId)) {
      await emitLog(
        server,
        'notice',
        { event: 'task_cancelled_before_result', taskId },
        sessionId
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
      createToolResponse(result, buildTraceResource(session))
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
      sessionId
    );
  } catch (error) {
    const failureArgs: Parameters<typeof handleTaskFailure>[0] = {
      server,
      taskStore,
      taskId,
      error,
    };
    if (sessionId !== undefined) {
      failureArgs.sessionId = sessionId;
    }
    await handleTaskFailure(failureArgs);
  }
}

function getTaskId(extra: ReasoningTaskExtra): string {
  if (typeof extra.taskId !== 'string' || extra.taskId.length === 0) {
    throw new Error('Task ID missing in request context.');
  }
  return extra.taskId;
}

const TOOL_NAME = 'reasoning_think';

function withIconMeta(iconMeta?: IconMeta): { icons: IconMeta[] } | undefined {
  return iconMeta ? { icons: [iconMeta] } : undefined;
}

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
2. Continue: { sessionId: "<from response>", level: "<same level>", thought: "next step..." }
3. Repeat step 2 until response shows status: "completed"

IMPORTANT: You MUST pass the returned sessionId on every continuation call, and use the same level throughout.
The thought parameter stores YOUR reasoning verbatim — write thorough analysis in each step.

Levels: ${getLevelDescriptionString()}.
Alternative: Use runMode="run_to_completion" with thought + thoughts[] to submit all steps in one call.`,
      inputSchema: ReasoningThinkInputSchema,
      outputSchema: ReasoningThinkToolOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
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
        const extra = parseReasoningTaskExtra(rawExtra);
        const progressToken = extra._meta?.progressToken;

        if (!reasoningTaskLimiter.tryAcquire()) {
          throw new Error(TASK_OVERLOAD_MESSAGE);
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

        const controller = createCancellationController(extra.signal);
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
          controller,
        };
        if (progressToken !== undefined) {
          runReasoningArgs.progressToken = progressToken;
        }
        if (extra.sessionId !== undefined) {
          runReasoningArgs.sessionId = extra.sessionId;
        }

        void runReasoningTask(runReasoningArgs).finally(() => {
          reasoningTaskLimiter.release();
        });

        return { task };
      },

      getTask(_params, rawExtra) {
        const extra = parseReasoningTaskExtra(rawExtra);
        return extra.taskStore.getTask(getTaskId(extra));
      },

      async getTaskResult(_params, rawExtra) {
        const extra = parseReasoningTaskExtra(rawExtra);
        const result = await extra.taskStore.getTaskResult(getTaskId(extra));
        assertCallToolResult(result);
        return result;
      },
    }
  );
}
