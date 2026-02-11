import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { sessionStore } from '../engine/reasoner.js';

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

function serializeJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerAllResources(server: McpServer): void {
  server.registerResource(
    'reasoning.sessions',
    'reasoning://sessions',
    {
      title: 'Reasoning Sessions',
      description: 'List all active reasoning sessions.',
      mimeType: 'application/json',
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
        sessionId: (value) =>
          sessionStore
            .list()
            .map((session) => session.id)
            .filter((sessionId) => sessionId.startsWith(value))
            .slice(0, 20),
      },
    }
  );

  server.registerResource(
    'reasoning.session',
    sessionTemplate,
    {
      title: 'Reasoning Session Detail',
      description: 'Inspect one reasoning session by sessionId.',
      mimeType: 'application/json',
    },
    (uri, variables) => {
      const value = variables.sessionId;
      const sessionId = Array.isArray(value) ? value[0] : value;

      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new McpError(
          -32602,
          `Invalid sessionId in URI: ${uri.toString()}`
        );
      }

      const session = sessionStore.get(sessionId);
      if (!session) {
        throw new McpError(-32002, `Resource not found: ${uri.toString()}`);
      }

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
