import { AsyncLocalStorage } from 'node:async_hooks';

interface EngineContext {
  readonly sessionId: string;
  readonly abortSignal?: AbortSignal;
}

const storage = new AsyncLocalStorage<EngineContext>();

export function runWithContext<T>(ctx: EngineContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): EngineContext | undefined {
  return storage.getStore();
}
