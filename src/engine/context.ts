import { AsyncLocalStorage } from 'node:async_hooks';

interface EngineContext {
  readonly sessionId: string;
}

const storage = new AsyncLocalStorage<EngineContext>();

export function runWithContext<T>(ctx: EngineContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
