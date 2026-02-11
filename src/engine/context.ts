import { AsyncLocalStorage } from 'node:async_hooks';

export interface EngineContext {
  sessionId: string;
  abortSignal?: AbortSignal;
}

const storage = new AsyncLocalStorage<EngineContext>();

export function runWithContext<T>(ctx: EngineContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): EngineContext | undefined {
  return storage.getStore();
}
