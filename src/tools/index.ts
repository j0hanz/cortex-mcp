import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IconMeta } from '../lib/types.js';

import { registerReasoningThinkTool } from './reasoning-think.js';

/**
 * Registers all tools with the MCP server.
 */
export function registerAllTools(server: McpServer, iconMeta?: IconMeta): void {
  registerReasoningThinkTool(server, iconMeta);
}
