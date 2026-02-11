import { readFileSync } from 'node:fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAllTools } from './tools/index.js';

function loadInstructions(): string | undefined {
  try {
    const instructions = readFileSync(
      new URL('instructions.md', import.meta.url),
      'utf8'
    ).trim();
    return instructions.length > 0 ? instructions : undefined;
  } catch {
    return undefined;
  }
}

export function createServer(): McpServer {
  const instructions = loadInstructions();

  const server = new McpServer(
    {
      name: 'cortex-mcp',
      title: 'Cortex MCP',
      description:
        'Multi-level reasoning MCP server with configurable depth levels.',
      version: '1.0.0',
    },
    {
      capabilities: { tools: {}, logging: {} },
      ...(instructions ? { instructions } : {}),
    }
  );

  registerAllTools(server);

  return server;
}
