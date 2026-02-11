import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerReasoningThinkTool } from './reasoning-think.js';

export function registerAllTools(server: McpServer): void {
  registerReasoningThinkTool(server);
}
