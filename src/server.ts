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

function loadVersion(): string {
  const packageJson = readFileSync(
    new URL('../package.json', import.meta.url),
    'utf8'
  );
  return (JSON.parse(packageJson) as { version: string }).version;
}

export function createServer(): McpServer {
  const instructions = loadInstructions();
  const version = loadVersion();

  const server = new McpServer(
    {
      name: 'cortex-mcp',
      title: 'Cortex MCP',
      description:
        'Multi-level reasoning MCP server with configurable depth levels.',
      version,
    },
    {
      capabilities: { tools: {}, logging: {} },
      ...(instructions ? { instructions } : {}),
    }
  );

  registerAllTools(server);

  return server;
}
