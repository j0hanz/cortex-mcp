import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  LoggingLevel,
} from '@modelcontextprotocol/sdk/types.js';

import {
  createErrorResponse,
  getErrorMessage,
  InsufficientThoughtsError,
  InvalidRunModeArgsError,
  ReasoningError,
  ServerBusyError,
  SessionNotFoundError,
} from '../lib/errors.js';
import { notifyProgress, shouldEmitProgress } from '../lib/mcp.js';
import { createToolResponse, withIconMeta } from '../lib/mcp.js';
import { formatProgressMessage } from '../lib/session.js';
// DISABLED: VS Code result.md rendering issue
// import { buildTraceResource } from '../lib/session.js';
import type {
  IconMeta,
  ReasoningLevel,
  ReasoningRunMode,
  Session,
} from '../lib/types.js';
import { createTaskLimiter } from '../lib/utils.js';
import {
  type ReasoningThinkInput,
  ReasoningThinkInputSchema,
} from '../schemas/inputs.js';
import {
  type ReasoningThinkSuccess,
  ReasoningThinkToolOutputSchema,
} from '../schemas/outputs.js';

import {
  getLevelDescriptionString,
  getMaxActiveReasoningTasks,
  // DISABLED: VS Code result.md rendering issue
  // shouldRedactTraceContent,
} from '../engine/config.js';
import { reason, sessionStore } from '../engine/reasoner.js';

type ProgressToken = string | number;

interface CancellationController {
  controller: AbortController;
  cleanup: () => void;
}

const reasoningTaskLimiter = createTaskLimiter(getMaxActiveReasoningTasks());

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

function hasExtraStepFields(params: ReasoningThinkInput): boolean {
  return (
    params.observation !== undefined ||
    params.hypothesis !== undefined ||
    params.evaluation !== undefined ||
    params.isConclusion !== undefined ||
    params.rollbackToStep !== undefined
  );
}

type ExecuteArgs = Parameters<typeof executeReasoningSteps>[0];

function buildExecuteArgs(base: {
  controller: AbortController;
  queryText: string;
  level: ReasoningLevel | undefined;
  runMode: ReasoningRunMode;
  thoughtInputs: string[];
  onProgress: ExecuteArgs['onProgress'];
  params: ReasoningThinkInput;
  targetThoughts: number | undefined;
}): ExecuteArgs {
  const { params, targetThoughts, ...rest } = base;
  const args: ExecuteArgs = rest;
  if (params.sessionId !== undefined) args.sessionId = params.sessionId;
  if (targetThoughts !== undefined) args.targetThoughts = targetThoughts;
  if (params.observation !== undefined) args.observation = params.observation;
  if (params.hypothesis !== undefined) args.hypothesis = params.hypothesis;
  if (params.evaluation !== undefined) args.evaluation = params.evaluation;
  if (params.stepSummary !== undefined) args.stepSummary = params.stepSummary;
  if (params.isConclusion !== undefined)
    args.isConclusion = params.isConclusion;
  if (params.rollbackToStep !== undefined)
    args.rollbackToStep = params.rollbackToStep;
  return args;
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
    if (controller.signal.aborted) {
      break;
    }

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
  data: Record<string, unknown>
): Promise<void> {
  try {
    await server.sendLoggingMessage({
      level,
      logger: TOOL_NAME,
      data,
    });
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

function createProgressHandler(args: {
  server: McpServer;
  level: ReasoningLevel | undefined;
  progressToken?: ProgressToken;
  startingCount: number;
  batchTotal: number;
}): (progress: number, total: number, summary?: string) => Promise<void> {
  const { server, level, progressToken, startingCount, batchTotal } = args;

  return async (
    progress: number,
    _total: number,
    summary?: string
  ): Promise<void> => {
    if (progressToken === undefined) {
      return;
    }

    const currentBatchIndex = Math.max(0, progress - startingCount);
    const displayProgress = Math.min(currentBatchIndex, batchTotal);
    const isTerminal = displayProgress >= batchTotal;
    if (
      !isTerminal &&
      !shouldEmitProgress(displayProgress, batchTotal, level)
    ) {
      return;
    }

    const message = formatProgressMessage({
      phase: isTerminal ? 'complete' : 'update',
      ...(summary ? { summary } : {}),
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

function assertRunToCompletionLevel(params: ReasoningThinkInput): void {
  let effectiveLevel = params.level;
  if (effectiveLevel === undefined && params.sessionId) {
    effectiveLevel = sessionStore.get(params.sessionId)?.level;
  }
  if (effectiveLevel !== undefined && effectiveLevel !== 'basic') {
    throw new InvalidRunModeArgsError(
      `run_to_completion is only available for basic level (current: ${effectiveLevel}). Use runMode: "step" for normal/high/expert.`
    );
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

  const hasStructuredInput =
    params.observation !== undefined &&
    params.hypothesis !== undefined &&
    params.evaluation !== undefined;
  const hasStructuredOnlyFirstStep =
    thoughtInputs.length === 0 && hasStructuredInput;

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

  const providedInputs =
    thoughtInputs.length + (hasStructuredOnlyFirstStep ? 1 : 0);
  if (providedInputs < requiredInputs) {
    throw new InsufficientThoughtsError(
      `run_to_completion requires at least ${String(
        requiredInputs
      )} thought inputs; received ${String(providedInputs)}`
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
      return `${originalMessage} Fix: run_to_completion is only available for basic level. For other levels, use runMode: "step".`;
    default:
      return originalMessage;
  }
}

function computeBatchTotal(
  runMode: ReasoningRunMode,
  thoughtCount: number,
  params: ReasoningThinkInput
): number {
  let batchTotal = runMode === 'step' ? 1 : thoughtCount;
  if (batchTotal === 0 && hasExtraStepFields(params)) {
    batchTotal = 1;
  }
  return Math.max(1, batchTotal);
}

async function emitInitialProgress(
  server: McpServer,
  progressToken: ProgressToken,
  total: number,
  level: ReasoningLevel | undefined
): Promise<void> {
  const message = formatProgressMessage({
    phase: 'start',
    isContinuation: level === undefined,
  });
  await notifyProgress({ server, progressToken, progress: 0, total, message });
}

const TOOL_NAME = 'reasoning_think';

export function registerReasoningThinkTool(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Reasoning Think',
      description: `Structured multi-step reasoning tool. Decomposes analysis into sequential thought steps stored in a persistent session trace.

USAGE PATTERN:
1. Start: { query: "...", level: "basic"|"normal"|"high"|"expert", thought: "your analysis..." }
2. Continue: { sessionId: "<from response>", thought: "next step..." } — level is optional; session level is used
3. Repeat until status: "completed" — the summary field contains the exact next call to make

IMPORTANT: Pass the returned sessionId on every continuation call.
The thought parameter stores YOUR reasoning verbatim — write thorough analysis in each step.
Use stepSummary for a 1-sentence conclusion per step — these accumulate in the summary field for navigation.

Levels: ${getLevelDescriptionString()}.
Alternatives: runMode="run_to_completion" (batch, basic level only), or observation/hypothesis/evaluation fields (structured).
Errors: E_SESSION_NOT_FOUND (expired — start new), E_INVALID_THOUGHT_COUNT (check level ranges).`,
      inputSchema: ReasoningThinkInputSchema,
      outputSchema: ReasoningThinkToolOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      ...(withIconMeta(iconMeta) ?? {}),
    },
    async (params, extra) => {
      if (!reasoningTaskLimiter.tryAcquire()) {
        return createErrorResponse(
          'E_SERVER_BUSY',
          new ServerBusyError().message
        );
      }

      const cancellation = createCancellationController(extra.signal);
      const progressToken = extra._meta?.progressToken;
      try {
        return await runReasoning({
          server,
          params,
          controller: cancellation.controller,
          ...(progressToken !== undefined ? { progressToken } : {}),
          ...(extra.sessionId !== undefined
            ? { sessionId: extra.sessionId }
            : {}),
        });
      } finally {
        cancellation.cleanup();
        reasoningTaskLimiter.release();
      }
    }
  );
}

// DISABLED: VS Code result.md rendering issue
// const MAX_EMBED_TRACE_TOKENS = 50_000;

async function runReasoning(args: {
  server: McpServer;
  params: ReasoningThinkInput;
  progressToken?: ProgressToken;
  controller: AbortController;
  sessionId?: string;
}): Promise<CallToolResult> {
  const { server, params, progressToken, controller, sessionId } = args;
  const { query, level, targetThoughts } = params;
  const runMode = params.runMode ?? 'step';
  const thoughtInputs = buildThoughtInputs(params);
  const queryText = query ?? '';
  let resolvedSessionId = params.sessionId ?? sessionId;

  await emitLog(server, 'info', {
    event: 'reasoning_started',
    level,
    runMode,
    hasSessionId: params.sessionId !== undefined,
    targetThoughts: targetThoughts ?? null,
    thoughtInputs: thoughtInputs.length,
  });

  try {
    if (runMode === 'run_to_completion') {
      assertRunToCompletionLevel(params);
      assertRunToCompletionInputCount(params, thoughtInputs);
    }

    const startingCount = getStartingThoughtCount(params.sessionId);
    const normalizedBatchTotal = computeBatchTotal(
      runMode,
      thoughtInputs.length,
      params
    );

    if (progressToken !== undefined) {
      await emitInitialProgress(
        server,
        progressToken,
        normalizedBatchTotal,
        level
      );
    }

    const onProgress = createProgressHandler({
      server,
      level,
      startingCount,
      batchTotal: normalizedBatchTotal,
      ...(progressToken !== undefined ? { progressToken } : {}),
    });

    const executeArgs = buildExecuteArgs({
      controller,
      queryText,
      level,
      runMode,
      thoughtInputs,
      onProgress,
      params,
      targetThoughts,
    });

    const session = await executeReasoningSteps(executeArgs);
    resolvedSessionId = session.id;

    if (controller.signal.aborted) {
      sessionStore.markCancelled(resolvedSessionId);
      await emitLog(server, 'notice', { event: 'reasoning_cancelled' });
      return createErrorResponse('E_ABORTED', 'Request cancelled by client');
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

    await emitLog(server, 'info', {
      event: 'reasoning_completed',
      sessionId: session.id,
      generatedThoughts,
      totalThoughts: session.thoughts.length,
    });

    // DISABLED: VS Code result.md rendering issue
    // return createToolResponse(
    //   result,
    //   session.tokensUsed <= MAX_EMBED_TRACE_TOKENS
    //     ? buildTraceResource(session, shouldRedactTraceContent())
    //     : undefined
    // );
    return createToolResponse(result);
  } catch (error) {
    const originalMessage = getErrorMessage(error);
    const errorCode = getReasoningErrorCode(error);
    const message = getActionableMessage(errorCode, originalMessage);

    if (controller.signal.aborted && resolvedSessionId) {
      sessionStore.markCancelled(resolvedSessionId);
    }

    await emitLog(server, errorCode === 'E_ABORTED' ? 'notice' : 'error', {
      event: 'reasoning_failed',
      code: errorCode,
      message,
    });

    return createErrorResponse(errorCode, message);
  }
}
