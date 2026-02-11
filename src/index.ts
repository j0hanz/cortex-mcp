#!/usr/bin/env node
import { isMainThread, threadId } from 'node:worker_threads';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

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

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  void shutdown(1, 'fatal error');
});

process.once('SIGTERM', () => {
  void shutdown(0, 'SIGTERM');
});
process.once('SIGINT', () => {
  void shutdown(0, 'SIGINT');
});
