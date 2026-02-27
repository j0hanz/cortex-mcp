import type { CallToolResult, Task } from '@modelcontextprotocol/sdk/types.js';

export interface TaskStoreLike {
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

export type ProgressToken = string | number;

export interface TaskContext {
  signal: AbortSignal;
  sessionId?: string;
  taskId?: string;
  taskRequestedTtl?: number | null;
  taskStore: TaskStoreLike;
  _meta?: { progressToken?: ProgressToken } & Record<string, unknown>;
}

export interface CancellationController {
  controller: AbortController;
  cleanup: () => void;
}
