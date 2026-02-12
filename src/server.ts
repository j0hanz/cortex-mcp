import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { engineEvents } from './engine/events.js';

import { getErrorMessage } from './lib/errors.js';
import { loadInstructions } from './lib/instructions.js';
import type { IconMeta } from './lib/types.js';

import { registerAllTools } from './tools/index.js';

import { registerAllPrompts } from './prompts/index.js';

import { registerAllResources } from './resources/index.js';

const ICON_MIME = 'image/svg+xml';

interface BudgetExhaustedEvent {
  sessionId: string;
  tokensUsed: number;
  tokenBudget: number;
  generatedThoughts: number;
  requestedThoughts: number;
}

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
  const parsed: unknown = JSON.parse(packageJson);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error('Invalid package.json: missing or invalid version field');
  }
  return parsed.version;
}

function attachEngineEventHandlers(server: McpServer): () => void {
  const onResourcesChanged = (): void => {
    void server.server.sendResourceListChanged().catch((err: unknown) => {
      void server
        .sendLoggingMessage({
          level: 'debug',
          logger: 'cortex-mcp.server',
          data: {
            event: 'notification_failed',
            method: 'resources/list_changed',
            error: getErrorMessage(err),
          },
        })
        .catch(() => {
          // Never fail on logging errors.
        });
    });
  };

  const onResourceUpdated = (data: { uri: string }): void => {
    void server.server
      .sendResourceUpdated({ uri: data.uri })
      .catch((err: unknown) => {
        void server
          .sendLoggingMessage({
            level: 'debug',
            logger: 'cortex-mcp.server',
            data: {
              event: 'notification_failed',
              method: 'resources/updated',
              uri: data.uri,
              error: getErrorMessage(err),
            },
          })
          .catch(() => {
            // Never fail on logging errors.
          });
      });
  };

  const onBudgetExhausted = (data: BudgetExhaustedEvent): void => {
    void server
      .sendLoggingMessage({
        level: 'notice',
        logger: 'cortex-mcp.reasoner',
        data: {
          event: 'budget_exhausted',
          sessionId: data.sessionId,
          tokensUsed: data.tokensUsed,
          tokenBudget: data.tokenBudget,
          generatedThoughts: data.generatedThoughts,
          requestedThoughts: data.requestedThoughts,
        },
      })
      .catch((err: unknown) => {
        // Never fail on logging errors - use stderr as last resort.
        process.stderr.write(
          `[cortex-mcp.server] Failed to log budget_exhausted: ${getErrorMessage(err)}\n`
        );
      });
  };

  engineEvents.on('resources:changed', onResourcesChanged);
  engineEvents.on('resource:updated', onResourceUpdated);
  engineEvents.on('thought:budget-exhausted', onBudgetExhausted);

  let detached = false;
  return (): void => {
    if (detached) {
      return;
    }
    detached = true;
    engineEvents.off('resources:changed', onResourcesChanged);
    engineEvents.off('resource:updated', onResourceUpdated);
    engineEvents.off('thought:budget-exhausted', onBudgetExhausted);
  };
}

function installCloseCleanup(server: McpServer, cleanup: () => void): void {
  const originalClose = server.close.bind(server);
  let closed = false;

  server.close = async (): Promise<void> => {
    if (closed) {
      return;
    }

    closed = true;
    cleanup();
    await originalClose();
  };
}

export function createServer(): McpServer {
  const instructions = loadInstructions();
  const version = loadVersion();
  const taskStore = new InMemoryTaskStore();
  const localIcon = getLocalIconData();
  const iconMeta: IconMeta | undefined = localIcon
    ? { src: localIcon, mimeType: ICON_MIME }
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
        resources: { subscribe: true, listChanged: true },
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

  const detachEngineHandlers = attachEngineEventHandlers(server);
  installCloseCleanup(server, detachEngineHandlers);

  return server;
}
