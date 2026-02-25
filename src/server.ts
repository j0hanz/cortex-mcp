import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { engineEvents } from './engine/events.js';
import type { ThoughtBudgetExhaustedPayload } from './engine/events.js';
import { sessionStore } from './engine/reasoner.js';

import { getErrorMessage } from './lib/errors.js';
import type { IconMeta } from './lib/types.js';

import { registerAllTools } from './tools/index.js';

import { registerAllPrompts } from './prompts/index.js';

import { registerAllResources } from './resources/index.js';

const ICON_MIME = 'image/svg+xml';
const SERVER_NAME = 'cortex-mcp';
const SERVER_TITLE = 'Cortex MCP';
const SERVER_WEBSITE_URL = 'https://github.com/j0hanz/cortex-mcp';
const RESOURCE_LIST_CHANGED_METHOD = 'resources/list_changed';
const RESOURCE_UPDATED_METHOD = 'resources/updated';
const SERVER_DESCRIPTION =
  'Multi-level reasoning MCP server with configurable depth levels.';
const ICON_URL_CANDIDATES = [
  new URL('../assets/logo.svg', import.meta.url),
  new URL('./assets/logo.svg', import.meta.url),
];
let cachedLocalIconData: string | null | undefined;
let cachedVersion: string | undefined;
let activeServerCount = 0;

function getLocalIconData(): string | undefined {
  if (cachedLocalIconData !== undefined) {
    return cachedLocalIconData ?? undefined;
  }

  for (const candidate of ICON_URL_CANDIDATES) {
    try {
      const data = readFileSync(candidate);
      cachedLocalIconData = `data:${ICON_MIME};base64,${data.toString('base64')}`;
      return cachedLocalIconData;
    } catch {
      continue;
    }
  }

  cachedLocalIconData = null;
  return undefined;
}

function getPackageVersion(parsed: unknown): string {
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

function loadVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const packageJsonPath = findPackageJSON(import.meta.url);
  if (!packageJsonPath) {
    throw new Error('Unable to locate package.json for cortex-mcp.');
  }

  const packageJson = readFileSync(packageJsonPath, 'utf8');
  cachedVersion = getPackageVersion(JSON.parse(packageJson) as unknown);
  return cachedVersion;
}

function getServerIcons(
  iconMeta?: IconMeta
): { src: string; mimeType: string }[] | undefined {
  if (!iconMeta) {
    return undefined;
  }
  return [
    {
      src: iconMeta.src,
      mimeType: iconMeta.mimeType,
    },
  ];
}

function attachEngineEventHandlers(server: McpServer): () => void {
  const logNotificationFailure = (
    method: string,
    error: unknown,
    data?: Record<string, unknown>
  ): void => {
    void server
      .sendLoggingMessage({
        level: 'debug',
        logger: 'cortex-mcp.server',
        data: {
          event: 'notification_failed',
          method,
          ...(data ?? {}),
          error: getErrorMessage(error),
        },
      })
      .catch(() => {
        // Never fail on logging errors.
      });
  };

  const onResourcesChanged = (): void => {
    void server.server.sendResourceListChanged().catch((err: unknown) => {
      logNotificationFailure(RESOURCE_LIST_CHANGED_METHOD, err);
    });
  };

  const onResourceUpdated = (data: { uri: string }): void => {
    void server.server
      .sendResourceUpdated({ uri: data.uri })
      .catch((err: unknown) => {
        logNotificationFailure(RESOURCE_UPDATED_METHOD, err, {
          uri: data.uri,
        });
      });
  };

  const onBudgetExhausted = (data: ThoughtBudgetExhaustedPayload): void => {
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

  const onSessionLifecycle = (data: { sessionId: string }): void => {
    void server.server.sendResourceListChanged().catch((err: unknown) => {
      logNotificationFailure(RESOURCE_LIST_CHANGED_METHOD, err, {
        sessionId: data.sessionId,
      });
    });
  };

  engineEvents.on('resources:changed', onResourcesChanged);
  engineEvents.on('resource:updated', onResourceUpdated);
  engineEvents.on('thought:budget-exhausted', onBudgetExhausted);
  engineEvents.on('session:created', onSessionLifecycle);
  engineEvents.on('session:completed', onSessionLifecycle);
  engineEvents.on('session:cancelled', onSessionLifecycle);
  engineEvents.on('session:expired', onSessionLifecycle);
  engineEvents.on('session:evicted', onSessionLifecycle);
  engineEvents.on('session:deleted', onSessionLifecycle);

  let detached = false;
  return (): void => {
    if (detached) {
      return;
    }
    detached = true;
    engineEvents.off('resources:changed', onResourcesChanged);
    engineEvents.off('resource:updated', onResourceUpdated);
    engineEvents.off('thought:budget-exhausted', onBudgetExhausted);
    engineEvents.off('session:created', onSessionLifecycle);
    engineEvents.off('session:completed', onSessionLifecycle);
    engineEvents.off('session:cancelled', onSessionLifecycle);
    engineEvents.off('session:expired', onSessionLifecycle);
    engineEvents.off('session:evicted', onSessionLifecycle);
    engineEvents.off('session:deleted', onSessionLifecycle);
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

    activeServerCount = Math.max(0, activeServerCount - 1);
    if (activeServerCount === 0) {
      sessionStore.dispose();
    }

    await originalClose();
  };
}

export function createServer(): McpServer {
  if (activeServerCount === 0) {
    sessionStore.ensureCleanupTimer();
  }
  activeServerCount += 1;

  const version = loadVersion();
  const taskStore = new InMemoryTaskStore();
  const localIcon = getLocalIconData();
  const iconMeta: IconMeta | undefined = localIcon
    ? { src: localIcon, mimeType: ICON_MIME }
    : undefined;
  const icons = getServerIcons(iconMeta);

  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: SERVER_TITLE,
      description: SERVER_DESCRIPTION,
      websiteUrl: SERVER_WEBSITE_URL,
      version,
      ...(icons ? { icons } : {}),
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        prompts: {},
        completions: {},
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
      instructions:
        'Multi-level reasoning MCP server. Use reasoning_think to decompose queries into sequential thought steps at basic (3–5), normal (6–10), or high (15–25) depth. Full usage guide: read internal://instructions or invoke get-help.',
    }
  );

  registerAllTools(server, iconMeta);
  registerAllPrompts(server, iconMeta);
  registerAllResources(server, iconMeta);

  const detachEngineHandlers = attachEngineEventHandlers(server);
  installCloseCleanup(server, detachEngineHandlers);

  return server;
}
