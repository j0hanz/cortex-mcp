import { readFileSync } from 'node:fs';

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAllTools } from './tools/index.js';

import { registerAllPrompts } from './prompts/index.js';

import { registerAllResources } from './resources/index.js';

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
  const taskStore = new InMemoryTaskStore();

  const server = new McpServer(
    {
      name: 'cortex-mcp',
      title: 'Cortex MCP',
      description:
        'Multi-level reasoning MCP server with configurable depth levels.',
      version,
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        prompts: {},
        resources: {},
        tasks: {
          list: {},
          cancel: {},
          requests: {
            tools: {
              call: {},
            },
          },
        },
      },
      taskStore,
      ...(instructions ? { instructions } : {}),
    }
  );

  registerAllTools(server);
  registerAllPrompts(server);
  registerAllResources(server);

  return server;
}
