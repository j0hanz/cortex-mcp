#!/usr/bin/env node
import { isMainThread, threadId } from 'node:worker_threads';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

const FATAL_SHUTDOWN_REASON = 'fatal error';
type ShutdownSignal = 'SIGTERM' | 'SIGINT';

let activeServer: ReturnType<typeof createServer> | undefined;
let shutdownPromise: Promise<void> | undefined;

function assertMainThread(): void {
  if (isMainThread) {
    return;
  }
  throw new Error(
    `cortex-mcp must run on the main thread (received worker thread ${String(threadId)}).`
  );
}

async function main(): Promise<void> {
  assertMainThread();
  activeServer = createServer();
  const transport = new StdioServerTransport();
  await activeServer.connect(transport);
}

function registerShutdownSignals(): void {
  registerShutdownSignal('SIGTERM');
  registerShutdownSignal('SIGINT');
}

async function shutdown(exitCode: number, reason: string): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    let resolvedCode = exitCode;

    try {
      await activeServer?.close();
    } catch (err) {
      resolvedCode = 1;
      console.error(`Shutdown failure (${reason}):`, err);
    } finally {
      process.exit(resolvedCode);
    }
  })();

  return shutdownPromise;
}

function registerShutdownSignal(signal: ShutdownSignal): void {
  process.once(signal, () => {
    void shutdown(0, signal);
  });
}

registerShutdownSignals();

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  void shutdown(1, FATAL_SHUTDOWN_REASON);
});
