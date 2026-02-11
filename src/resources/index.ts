import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { sessionStore } from '../engine/reasoner.js';

import { loadInstructions } from '../lib/instructions.js';
import type { IconMeta, Session } from '../lib/types.js';

import { formatThoughtsToMarkdown } from '../tools/reasoning-think.js';

// --- Helpers ---

function extractStringVariable(
  variables: Variables,
  name: string,
  uri: URL
): string {
  const raw = variables[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) {
    throw new McpError(-32602, `Invalid ${name} in URI: ${uri.toString()}`);
  }
  return value;
}

function resolveSession(sessionId: string, uri: URL): Readonly<Session> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new McpError(-32002, `Resource not found: ${uri.toString()}`);
  }
  return session;
}

function buildSessionSummary(sessionId: string): {
  id: string;
  level: 'basic' | 'normal' | 'high';
  totalThoughts: number;
  tokenBudget: number;
  tokensUsed: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
} {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new McpError(
      -32002,
      `Resource not found: reasoning://sessions/${sessionId}`
    );
  }

  const ttlMs = sessionStore.getTtlMs();
  const expiresAt =
    sessionStore.getExpiresAt(session.id) ?? session.updatedAt + ttlMs;

  return {
    id: session.id,
    level: session.level,
    totalThoughts: session.thoughts.length,
    tokenBudget: session.tokenBudget,
    tokensUsed: session.tokensUsed,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt,
  };
}

const THOUGHT_NAME_PATTERN = /^Thought-(\d+)(?:-Revised)?$/;

function parseThoughtName(
  thoughtName: string,
  session: Readonly<Session>
): { index: number; requestedRevised: boolean } {
  const match = THOUGHT_NAME_PATTERN.exec(thoughtName);
  if (!match?.[1]) {
    throw new McpError(
      -32602,
      `Invalid thought name format: ${thoughtName}. Expected "Thought-N" or "Thought-N-Revised".`
    );
  }

  const oneBasedIndex = parseInt(match[1], 10);
  const zeroBasedIndex = oneBasedIndex - 1;

  if (zeroBasedIndex < 0 || zeroBasedIndex >= session.thoughts.length) {
    throw new McpError(-32002, `Thought not found: ${thoughtName}`);
  }

  return {
    index: oneBasedIndex,
    requestedRevised: thoughtName.endsWith('-Revised'),
  };
}

function serializeJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

interface CompletionCacheEntry {
  results: string[];
  timestamp: number;
}

const completionCache = new Map<string, CompletionCacheEntry>();

export function registerAllResources(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  const instructions = loadInstructions();

  server.registerResource(
    'server-instructions',
    'internal://instructions',
    {
      title: 'Server Instructions',
      description: 'Usage instructions for the MCP server.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.8 },
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
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: instructions },
      ],
    })
  );

  server.registerResource(
    'reasoning.sessions',
    'reasoning://sessions',
    {
      title: 'Reasoning Sessions',
      description:
        'List of active reasoning sessions with summaries. Updated in real-time as sessions progress.',
      mimeType: 'application/json',
      annotations: {
        audience: ['assistant', 'user'],
        priority: 0.7,
      },
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
    () => {
      const ttlMs = sessionStore.getTtlMs();
      const sessions = sessionStore.list().map((session) => ({
        ...buildSessionSummary(session.id),
      }));

      return {
        contents: [
          {
            uri: 'reasoning://sessions',
            mimeType: 'application/json',
            text: serializeJson({
              ttlMs,
              totalSessions: sessions.length,
              sessions,
            }),
          },
        ],
      };
    }
  );

  // Template for full trace
  server.registerResource(
    'reasoning.trace',
    new ResourceTemplate('file:///cortex/sessions/{sessionId}/trace.md', {
      list: undefined,
    }),
    {
      title: 'Reasoning Trace',
      description: 'Markdown trace of a reasoning session (full content).',
      mimeType: 'text/markdown',
      ...(iconMeta
        ? {
            icons: [iconMeta],
          }
        : {}),
    },
    (uri, variables) => {
      const sessionId = extractStringVariable(variables, 'sessionId', uri);
      const session = resolveSession(sessionId, uri);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'text/markdown',
            text: formatThoughtsToMarkdown(session),
          },
        ],
      };
    }
  );

  // Template for individual thoughts
  server.registerResource(
    'reasoning.thought',
    new ResourceTemplate(
      'file:///cortex/sessions/{sessionId}/{thoughtName}.md',
      {
        list: undefined,
      }
    ),
    {
      title: 'Reasoning Thought',
      description: 'Markdown content of a single thought (e.g. Thought-1.md).',
      mimeType: 'text/markdown',
      ...(iconMeta
        ? {
            icons: [iconMeta],
          }
        : {}),
    },
    (uri, variables) => {
      const sessionId = extractStringVariable(variables, 'sessionId', uri);
      const session = resolveSession(sessionId, uri);
      const thoughtName = extractStringVariable(variables, 'thoughtName', uri);

      const { index, requestedRevised } = parseThoughtName(
        thoughtName,
        session
      );

      const thought = session.thoughts[index - 1];
      if (thought && requestedRevised && thought.revision === 0) {
        throw new McpError(
          -32002,
          `Thought ${String(index)} has not been revised.`
        );
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'text/markdown',
            text: formatThoughtsToMarkdown(session, {
              start: index,
              end: index,
            }),
          },
        ],
      };
    }
  );

  const sessionTemplate = new ResourceTemplate(
    'reasoning://sessions/{sessionId}',
    {
      list: () => ({
        resources: sessionStore.list().map((session) => ({
          uri: `reasoning://sessions/${session.id}`,
          name: `session-${session.id.slice(0, 8)}`,
          title: `Reasoning Session ${session.id.slice(0, 8)}`,
          description: `${session.level} session with ${String(session.thoughts.length)} thought(s).`,
          mimeType: 'application/json',
          annotations: {
            audience: ['assistant', 'user'],
            priority: 0.8,
            lastModified: new Date(session.updatedAt).toISOString(),
          },
        })),
      }),
      complete: {
        sessionId: (value) => {
          const cacheKey = `sessionId:${value}`;
          const cached = completionCache.get(cacheKey);
          const now = Date.now();

          // Cache for 1 second to prevent enumeration attacks
          if (cached && now - cached.timestamp < 1000) {
            return cached.results;
          }

          const results = sessionStore
            .list()
            .map((session) => session.id)
            .filter((sessionId) => sessionId.startsWith(value))
            .slice(0, 20);

          completionCache.set(cacheKey, { results, timestamp: now });
          return results;
        },
      },
    }
  );

  server.registerResource(
    'reasoning.session',
    sessionTemplate,
    {
      title: 'Reasoning Session Detail',
      description:
        'Detailed view of a single reasoning session, including all thoughts and metadata.',
      mimeType: 'application/json',
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
    (uri, variables) => {
      const sessionId = extractStringVariable(variables, 'sessionId', uri);
      const session = resolveSession(sessionId, uri);
      const summary = buildSessionSummary(sessionId);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: serializeJson({
              ...summary,
              thoughts: session.thoughts.map((thought) => ({
                index: thought.index,
                content: thought.content,
                revision: thought.revision,
              })),
            }),
          },
        ],
      };
    }
  );
}
