#!/usr/bin/env node
import { isMainThread, threadId } from 'node:worker_threads';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

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
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
