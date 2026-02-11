import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAllTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'cortex-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, logging: {} } }
  );

  registerAllTools(server);

  return server;
}
