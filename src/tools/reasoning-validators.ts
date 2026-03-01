import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { isObjectRecord, ReasoningError } from '../lib/errors.js';
import type { ProgressToken, TaskContext, TaskStoreLike } from '../lib/task.js';

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

function isReasoningTaskExtra(value: unknown): value is TaskContext {
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

export function assertReasoningTaskExtra(rawExtra: unknown): TaskContext {
  if (!isReasoningTaskExtra(rawExtra)) {
    throw new ReasoningError(
      'E_INVALID_CONTEXT',
      'Invalid task context in request handler.'
    );
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

export function assertCallToolResult(
  value: unknown
): asserts value is CallToolResult {
  if (!isCallToolResult(value)) {
    throw new Error('Stored task result is not a valid CallToolResult.');
  }
}
