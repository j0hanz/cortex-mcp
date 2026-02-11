import { readFileSync } from 'node:fs';

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IconMeta } from './lib/types.js';

import { registerReasoningThinkTool } from './tools/reasoning-think.js';

import { registerAllPrompts } from './prompts/index.js';

import { registerAllResources } from './resources/index.js';

const ICON_MIME = 'image/svg+xml';
const ICON_SIZES: string[] = ['any'];

function getLocalIconData(): string | undefined {
  const candidates = [
    new URL('../assets/logo.svg', import.meta.url),
    new URL('./assets/logo.svg', import.meta.url),
  ];

  for (const candidate of candidates) {
    try {
      const data = readFileSync(candidate);
      return `data:${ICON_MIME};base64,${data.toString('base64')}`;
    } catch {
      continue;
    }
  }

  return undefined;
}

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
  const localIcon = getLocalIconData();
  const iconMeta: IconMeta | undefined = localIcon
    ? { src: localIcon, mimeType: ICON_MIME, sizes: ICON_SIZES }
    : undefined;

  const server = new McpServer(
    {
      name: 'cortex-mcp',
      title: 'Cortex MCP',
      description:
        'Multi-level reasoning MCP server with configurable depth levels.',
      version,
      ...(iconMeta
        ? {
            icons: [
              {
                src: iconMeta.src,
                mimeType: iconMeta.mimeType,
                sizes: iconMeta.sizes,
              },
            ],
          }
        : {}),
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

  registerReasoningThinkTool(server, iconMeta);
  registerAllPrompts(server, iconMeta);
  registerAllResources(server, iconMeta);

  return server;
}
