import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IconMeta } from '../lib/types.js';

import { registerReasoningThinkTool } from './reasoning-think.js';

type ToolRegistrar = (server: McpServer, iconMeta?: IconMeta) => void;

const TOOL_REGISTRARS: readonly ToolRegistrar[] = [registerReasoningThinkTool];

export function registerAllTools(server: McpServer, iconMeta?: IconMeta): void {
  for (const registerTool of TOOL_REGISTRARS) {
    registerTool(server, iconMeta);
  }
}
