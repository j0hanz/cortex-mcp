import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { sessionStore } from '../engine/reasoner.js';

import { formatThoughtsToMarkdown } from '../lib/formatting.js';
import { loadInstructions } from '../lib/instructions.js';
import type { IconMeta, Session } from '../lib/types.js';

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
  status: 'active' | 'completed' | 'cancelled';
  generatedThoughts: number;
  remainingThoughts: number;
  plannedThoughts: number;
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
    status: session.status,
    generatedThoughts: session.thoughts.length,
    remainingThoughts: Math.max(
      0,
      session.totalThoughts - session.thoughts.length
    ),
    plannedThoughts: session.totalThoughts,
    totalThoughts: session.totalThoughts,
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

const COMPLETION_CACHE_TTL_MS = 1000;
const COMPLETION_CACHE_MAX_ENTRIES = 512;
const MAX_COMPLETION_RESULTS = 20;
const completionCache = new Map<string, CompletionCacheEntry>();

function pruneCompletionCache(now: number): void {
  for (const [cacheKey, entry] of completionCache.entries()) {
    if (now - entry.timestamp >= COMPLETION_CACHE_TTL_MS) {
      completionCache.delete(cacheKey);
    }
  }

  while (completionCache.size > COMPLETION_CACHE_MAX_ENTRIES) {
    const oldestKey = completionCache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    completionCache.delete(oldestKey);
  }
}

function completeSessionIds(value: string): string[] {
  const now = Date.now();
  pruneCompletionCache(now);
  const cacheKey = `sessionId:${value}`;
  const cached = completionCache.get(cacheKey);

  if (cached && now - cached.timestamp < COMPLETION_CACHE_TTL_MS) {
    return cached.results;
  }

  const results: string[] = [];
  for (const session of sessionStore.list()) {
    if (!session.id.startsWith(value)) {
      continue;
    }
    results.push(session.id);
    if (results.length >= MAX_COMPLETION_RESULTS) {
      break;
    }
  }

  completionCache.set(cacheKey, { results, timestamp: now });
  pruneCompletionCache(now);
  return results;
}

function completeThoughtNames(value: string, sessionId: string): string[] {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return [];
  }

  const results: string[] = [];
  for (const thought of session.thoughts) {
    const base = `Thought-${String(thought.index + 1)}`;
    if (base.startsWith(value)) {
      results.push(base);
    }
    if (thought.revision > 0) {
      const revised = `${base}-Revised`;
      if (revised.startsWith(value)) {
        results.push(revised);
      }
    }
    if (results.length >= MAX_COMPLETION_RESULTS) {
      break;
    }
  }
  return results;
}

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
      complete: {
        sessionId: completeSessionIds,
      },
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
        complete: {
          sessionId: completeSessionIds,
          thoughtName: (value, context) => {
            const sessionId = context?.arguments?.sessionId;
            if (typeof sessionId !== 'string' || sessionId.length === 0) {
              return [];
            }
            return completeThoughtNames(value, sessionId);
          },
        },
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
          description: `${session.level} session with ${String(
            session.thoughts.length
          )}/${String(session.totalThoughts)} thought(s).`,
          mimeType: 'application/json',
          annotations: {
            audience: ['assistant', 'user'],
            priority: 0.8,
            lastModified: new Date(session.updatedAt).toISOString(),
          },
        })),
      }),
      complete: {
        sessionId: completeSessionIds,
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
