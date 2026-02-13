import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  LoggingLevel,
  Task,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

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
    typeof value.taskRequestedTtl !== 'number'
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
  if (
    message === 'Reasoning aborted' ||
    message === 'Reasoning task cancelled'
  ) {
    return 'E_ABORTED';
  }
  if (
    message.startsWith('targetThoughts must be') ||
    message.startsWith('Cannot change targetThoughts')
  ) {
    return 'E_INVALID_THOUGHT_COUNT';
  }
  if (message.startsWith('Session not found:')) {
    return 'E_SESSION_NOT_FOUND';
  }
  if (message.startsWith('Session level mismatch:')) {
    return 'E_SESSION_LEVEL_MISMATCH';
  }
  if (message.startsWith('run_to_completion requires at least')) {
    return 'E_INSUFFICIENT_THOUGHTS';
  }
  if (
    message.startsWith(
      'targetThoughts is required for run_to_completion when sessionId is not provided'
    )
  ) {
    return 'E_INVALID_RUN_MODE_ARGS';
  }
  if (message === TASK_OVERLOAD_MESSAGE) {
    return 'E_SERVER_BUSY';
  }
  return 'E_REASONING';
}

function shouldEmitProgress(
  progress: number,
  total: number,
  level: ReasoningLevel | undefined
): boolean {
  if (progress <= 1 || progress >= total || level !== 'high') {
    return true;
  }
  return progress % 2 === 0;
}

function resolveRunMode(params: ReasoningThinkInput): ReasoningRunMode {
  return params.runMode ?? 'step';
}

function buildThoughtInputs(params: ReasoningThinkInput): string[] {
  const primary = Array.isArray(params.thought)
    ? params.thought
    : [params.thought];
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
  } = args;

  let activeSessionId = sessionId;
  let session: Readonly<Session> | undefined;
  const maxSteps = runMode === 'step' ? 1 : thoughtInputs.length;

  for (let index = 0; index < maxSteps; index++) {
    await ensureTaskIsActive(taskStore, taskId, controller);

    const inputThought = thoughtInputs[index];
    if (inputThought === undefined) {
      break;
    }

    session = await reason(queryText, level, {
      ...(activeSessionId !== undefined ? { sessionId: activeSessionId } : {}),
      ...(targetThoughts !== undefined ? { targetThoughts } : {}),
      thought: inputThought,
      abortSignal: controller.signal,
      onProgress,
    });

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
  return (
    `CONTINUE: Call reasoning_think with { sessionId: "${session.id}", level: "${session.level}", thought: "<your next reasoning step>" }. ` +
    `Progress: ${String(session.thoughts.length)}/${String(session.totalThoughts)} thoughts, ${String(remainingThoughts)} remaining.`
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
  signal.addEventListener(
    'abort',
    () => {
      controller.abort();
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
}): (progress: number, total: number) => Promise<void> {
  const { server, taskStore, taskId, level, progressToken, controller } = args;

  return async (progress: number, total: number): Promise<void> => {
    await ensureTaskIsActive(taskStore, taskId, controller);

    if (
      progressToken === undefined ||
      !shouldEmitProgress(progress, total, level)
    ) {
      return;
    }

    await server.server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total,
        message: `𖦹 Thought [${String(progress)}/${String(total)}]`,
      },
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

async function handleTaskFailure(args: {
  server: McpServer;
  taskStore: TaskStoreLike;
  taskId: string;
  sessionId?: string;
  error: unknown;
}): Promise<void> {
  const { server, taskStore, taskId, sessionId, error } = args;
  const message = getErrorMessage(error);
  const errorCode = mapReasoningErrorCode(message);
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
    await emitLog(
      server,
      'notice',
      { event: 'task_aborted', taskId, reason: message },
      sessionId
    );
    return;
  }

  await storeTaskFailure(taskStore, taskId, response);
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

    const onProgress = createProgressHandler({
      server,
      taskStore,
      taskId,
      level,
      controller,
      ...(progressToken !== undefined ? { progressToken } : {}),
    });
    const session = await executeReasoningSteps({
      taskStore,
      taskId,
      controller,
      queryText,
      level,
      ...(params.sessionId !== undefined
        ? { sessionId: params.sessionId }
        : {}),
      ...(targetThoughts !== undefined ? { targetThoughts } : {}),
      runMode,
      thoughtInputs,
      onProgress,
    });

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
    await handleTaskFailure({
      server,
      taskStore,
      taskId,
      error,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }
}

function getTaskId(extra: ReasoningTaskExtra): string {
  if (typeof extra.taskId !== 'string' || extra.taskId.length === 0) {
    throw new Error('Task ID missing in request context.');
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
      description:
        'Structured multi-step reasoning tool. Decomposes analysis into sequential thought steps stored in a persistent session trace.\n\n' +
        'USAGE PATTERN:\n' +
        '1. Start: { query: "...", level: "basic"|"normal"|"high", thought: "your analysis..." }\n' +
        '2. Continue: { sessionId: "<from response>", level: "<same level>", thought: "next step..." }\n' +
        '3. Repeat step 2 until response shows status: "completed"\n\n' +
        'IMPORTANT: You MUST pass the returned sessionId on every continuation call, and use the same level throughout.\n' +
        'The thought parameter stores YOUR reasoning verbatim — write thorough analysis in each step.\n\n' +
        'Levels: basic (3–5 steps, 2K budget), normal (6–10, 8K), high (15–25, 32K).\n' +
        'Alternative: Use runMode="run_to_completion" with thought + thoughts[] to submit all steps in one call.',
      inputSchema: ReasoningThinkInputSchema,
      outputSchema: ReasoningThinkToolOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
      execution: { taskSupport: 'optional' },
      ...(iconMeta
        ? {
            icons: [
              {
                src: iconMeta.src,
                mimeType: iconMeta.mimeType,
              },
            ],
          }
        : {}),
    },
    {
      async createTask(rawParams, rawExtra) {
        const parseResult = ReasoningThinkInputSchema.safeParse(rawParams);
        if (!parseResult.success) {
          throw new Error(
            `Invalid reasoning_think params: ${parseResult.error.message}`
          );
        }
        const params = parseResult.data;
        const extra = parseReasoningTaskExtra(rawExtra);
        const progressToken = extra._meta?.progressToken;

        const task = await extra.taskStore.createTask({
          ttl: extra.taskRequestedTtl ?? null,
          pollInterval: 500,
        });

        if (!reasoningTaskLimiter.tryAcquire()) {
          throw new Error(TASK_OVERLOAD_MESSAGE);
        }

        try {
          const controller = createCancellationController(extra.signal);
          void runReasoningTask({
            server,
            taskStore: extra.taskStore,
            taskId: task.taskId,
            params,
            controller,
            ...(progressToken !== undefined ? { progressToken } : {}),
            ...(extra.sessionId !== undefined
              ? { sessionId: extra.sessionId }
              : {}),
          }).finally(() => {
            reasoningTaskLimiter.release();
          });
        } catch (error) {
          reasoningTaskLimiter.release();
          throw error;
        }

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
