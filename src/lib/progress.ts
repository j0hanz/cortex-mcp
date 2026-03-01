import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ReasoningLevel } from './types.js';

type ProgressToken = string | number;

export function shouldEmitProgress(
  progress: number,
  total: number,
  level: ReasoningLevel | undefined
): boolean {
  if (progress <= 1 || progress >= total) {
    return true;
  }
  // High level: emit every 2 steps to reduce noise
  if (level === 'high') {
    return progress % 2 === 0;
  }
  // Basic/Normal: emit every step
  return true;
}

export async function notifyProgress(args: {
  server: McpServer;
  progressToken: ProgressToken;
  progress: number;
  total: number;
  message: string;
}): Promise<void> {
  const { server, progressToken, progress, total, message } = args;
  try {
    await server.server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total,
        message,
      },
    });
  } catch {
    // Ignore notification errors
  }
}
