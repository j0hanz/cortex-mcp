import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadInstructions } from './lib/instructions.js';
import type { IconMeta } from './lib/types.js';

import { registerAllTools } from './tools/index.js';

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

function loadVersion(): string {
  const packageJsonPath = findPackageJSON(import.meta.url);
  if (!packageJsonPath) {
    throw new Error('Unable to locate package.json for cortex-mcp.');
  }

  const packageJson = readFileSync(packageJsonPath, 'utf8');
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
      websiteUrl: 'https://github.com/j0hanz/cortex-mcp',
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

  registerAllTools(server, iconMeta);
  registerAllPrompts(server, iconMeta);
  registerAllResources(server, iconMeta);

  return server;
}
