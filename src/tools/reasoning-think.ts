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
import { createToolResponse } from '../lib/tool-response.js';
import type {
  IconMeta,
  ReasoningLevel,
  Session,
  Thought,
} from '../lib/types.js';

type ProgressToken = string | number;

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
  _meta?: { progressToken?: ProgressToken };
}

interface ReasoningStructuredResult {
  [key: string]: unknown;
  ok: true;
  result: {
    sessionId: string;
    level: ReasoningLevel;
    thoughts: { index: number; content: string; revision: number }[];
    generatedThoughts: number;
    requestedThoughts: number | null;
    totalThoughts: number;
    tokenBudget: number;
    tokensUsed: number;
    ttlMs: number;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
    summary: string;
  };
}

function mapReasoningErrorCode(message: string): string {
  if (
    message === 'Reasoning aborted' ||
    message === 'Reasoning task cancelled'
  ) {
    return 'E_ABORTED';
  }
  if (message.startsWith('targetThoughts must be')) {
    return 'E_INVALID_THOUGHT_COUNT';
  }
  if (message.startsWith('Session not found:')) {
    return 'E_SESSION_NOT_FOUND';
  }
  if (message.startsWith('Session level mismatch:')) {
    return 'E_SESSION_LEVEL_MISMATCH';
  }
  return 'E_REASONING';
}

function shouldEmitProgress(
  progress: number,
  total: number,
  level: ReasoningLevel
): boolean {
  if (progress <= 1 || progress >= total || level !== 'high') {
    return true;
  }
  return progress % 2 === 0;
}

function formatThoughtHeading(thought: Readonly<Thought>): string {
  const thoughtNumber = thought.index + 1;
  const suffix = thought.revision > 0 ? ' [Revised]' : '';
  return `𖦹 Thought [${String(thoughtNumber)}]${suffix}`;
}

export function formatThoughtsToMarkdown(
  session: Readonly<Session>,
  range?: { start: number; end: number }
): string {
  const { thoughts: allThoughts } = session;
  const isFullTrace = range === undefined;

  let thoughts: readonly Thought[];
  if (range) {
    const startIndex = Math.max(0, range.start - 1);
    const endIndex = Math.min(allThoughts.length, range.end);
    thoughts = allThoughts.slice(startIndex, endIndex);
  } else {
    thoughts = allThoughts;
  }

  const sections: string[] = [];

  if (isFullTrace && thoughts.length > 0) {
    sections.push(
      `# Reasoning Trace — [${session.level}]\n` +
        `> Session [${session.id}] · [${String(allThoughts.length)}] thoughts`
    );
  }

  for (const thought of thoughts) {
    const heading = formatThoughtHeading(thought);
    sections.push(`${heading}\n\n${thought.content}`);
  }

  return sections.join('\n\n---\n\n');
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

  return {
    ok: true,
    result: {
      sessionId: session.id,
      level: session.level,
      thoughts: session.thoughts.map((thought) => ({
        index: thought.index,
        content: thought.content,
        revision: thought.revision,
      })),
      generatedThoughts,
      requestedThoughts,
      totalThoughts: session.totalThoughts,
      tokenBudget: session.tokenBudget,
      tokensUsed: session.tokensUsed,
      ttlMs,
      expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      summary: `Session [${session.id}] at level [${session.level}] with [${session.thoughts.length}] thoughts.`,
    },
  };
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
  level: ReasoningLevel;
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

  if (await isTaskCancelled(taskStore, taskId)) {
    await emitLog(
      server,
      'notice',
      { event: 'task_cancelled', taskId, reason: message },
      sessionId
    );
    return;
  }

  if (errorCode === 'E_ABORTED') {
    await storeTaskFailure(
      taskStore,
      taskId,
      createErrorResponse(errorCode, message)
    );
    try {
      await taskStore.updateTaskStatus(
        taskId,
        'cancelled',
        'Task cancelled by request.'
      );
    } catch {
      // No-op if already terminal.
    }
    await emitLog(
      server,
      'notice',
      { event: 'task_cancelled', taskId, reason: message },
      sessionId
    );
    return;
  }

  await storeTaskFailure(
    taskStore,
    taskId,
    createErrorResponse(errorCode, message)
  );
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

  await emitLog(
    server,
    'info',
    {
      event: 'task_started',
      taskId,
      level,
      hasSessionId: params.sessionId !== undefined,
      targetThoughts: targetThoughts ?? null,
    },
    sessionId
  );

  try {
    const startingCount =
      params.sessionId !== undefined
        ? (sessionStore.get(params.sessionId)?.thoughts.length ?? 0)
        : 0;

    const progressArgs = {
      server,
      taskStore,
      taskId,
      level,
      controller,
      ...(progressToken !== undefined ? { progressToken } : {}),
    };

    const session = await reason(query, level, {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      ...(targetThoughts !== undefined ? { targetThoughts } : {}),
      abortSignal: controller.signal,
      onProgress: createProgressHandler(progressArgs),
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

    const markdownTrace = formatThoughtsToMarkdown(session);
    const embeddedResource: TextResourceContents = {
      uri: `file:///cortex/sessions/${session.id}/trace.md`,
      mimeType: 'text/markdown',
      text: markdownTrace,
    };

    await taskStore.storeTaskResult(
      taskId,
      'completed',
      createToolResponse(result, embeddedResource)
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
    const failureArgs = {
      server,
      taskStore,
      taskId,
      error,
      ...(sessionId !== undefined ? { sessionId } : {}),
    };
    await handleTaskFailure(failureArgs);
  }
}

function getTaskId(extra: ReasoningTaskExtra): string {
  if (typeof extra.taskId !== 'string' || extra.taskId.length === 0) {
    throw new Error('Task ID missing in request context.');
  }
  return extra.taskId;
}

export const TOOL_NAME = 'reasoning.think';

export function registerReasoningThinkTool(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  server.experimental.tasks.registerToolTask(
    TOOL_NAME,
    {
      title: 'Reasoning Think',
      description:
        'Perform multi-level reasoning on a query. Use this tool when you need to break down complex problems into structured thought chains. ' +
        'Supports three depth levels: basic (3–5 thoughts, 2K token budget), normal (6–10 thoughts, 8K budget), and high (15–25 thoughts, 32K budget). ' +
        'Returns a session with accumulated thoughts, token usage, and TTL metadata. ' +
        'Continue an existing session by providing sessionId. Supports task-augmented execution for long-running high-level reasoning.',
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
        const params = rawParams as ReasoningThinkInput;
        const extra = rawExtra as ReasoningTaskExtra;

        const task = await extra.taskStore.createTask({
          ttl: extra.taskRequestedTtl ?? null,
          pollInterval: 500,
        });

        const controller = createCancellationController(extra.signal);
        const taskArgs = {
          server,
          taskStore: extra.taskStore,
          taskId: task.taskId,
          params,
          controller,
          ...(extra._meta?.progressToken !== undefined
            ? { progressToken: extra._meta.progressToken }
            : {}),
          ...(extra.sessionId !== undefined
            ? { sessionId: extra.sessionId }
            : {}),
        };
        void runReasoningTask(taskArgs);

        return { task };
      },

      getTask(_params, rawExtra) {
        const extra = rawExtra as ReasoningTaskExtra;
        return extra.taskStore.getTask(getTaskId(extra));
      },

      getTaskResult(_params, rawExtra) {
        const extra = rawExtra as ReasoningTaskExtra;
        return extra.taskStore
          .getTaskResult(getTaskId(extra))
          .then((result) => result as CallToolResult);
      },
    }
  );
}
