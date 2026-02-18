import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { sessionStore } from '../engine/reasoner.js';

import { formatThoughtsToMarkdown } from '../lib/formatting.js';
import { loadInstructions } from '../lib/instructions.js';
import type {
  IconMeta,
  Session,
  SessionSummary as StoreSessionSummary,
} from '../lib/types.js';

const SESSIONS_RESOURCE_URI = 'reasoning://sessions';
const SESSION_RESOURCE_PREFIX = `${SESSIONS_RESOURCE_URI}/`;
const TRACE_RESOURCE_PREFIX = 'file:///cortex/sessions/';

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

interface SessionResourceSummary {
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
}

function buildSessionSummaryFromSummary(
  session: Readonly<StoreSessionSummary>
): SessionResourceSummary {
  const ttlMs = sessionStore.getTtlMs();
  const expiresAt =
    sessionStore.getExpiresAt(session.id) ?? session.updatedAt + ttlMs;

  return {
    id: session.id,
    level: session.level,
    status: session.status,
    generatedThoughts: session.generatedThoughts,
    remainingThoughts: Math.max(
      0,
      session.totalThoughts - session.generatedThoughts
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

function buildSessionSummary(sessionId: string): SessionResourceSummary {
  const session = sessionStore.getSummary(sessionId);
  if (!session) {
    throw new McpError(
      -32002,
      `Resource not found: ${SESSION_RESOURCE_PREFIX}${sessionId}`
    );
  }
  return buildSessionSummaryFromSummary(session);
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

function withIconMeta(iconMeta?: IconMeta): { icons: IconMeta[] } | undefined {
  return iconMeta ? { icons: [iconMeta] } : undefined;
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
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
  for (const sessionId of sessionStore.listSessionIds()) {
    if (!sessionId.startsWith(value)) {
      continue;
    }
    results.push(sessionId);
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
      ...(withIconMeta(iconMeta) ?? {}),
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: instructions },
      ],
    })
  );

  server.registerResource(
    'reasoning.sessions',
    SESSIONS_RESOURCE_URI,
    {
      title: 'Reasoning Sessions',
      description:
        'List of active reasoning sessions with summaries. Updated in real-time as sessions progress.',
      mimeType: 'application/json',
      annotations: {
        audience: ['assistant', 'user'],
        priority: 0.7,
      },
      ...(withIconMeta(iconMeta) ?? {}),
    },
    () => {
      const ttlMs = sessionStore.getTtlMs();
      const sessions = sessionStore
        .listSummaries()
        .map((session) => buildSessionSummaryFromSummary(session));

      return {
        contents: [
          {
            uri: SESSIONS_RESOURCE_URI,
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
      list: () => ({
        resources: sessionStore.listSummaries().map((session) => ({
          uri: `${TRACE_RESOURCE_PREFIX}${session.id}/trace.md`,
          name: `trace-${shortSessionId(session.id)}`,
          title: `Reasoning Trace ${shortSessionId(session.id)}`,
          description: `${session.level} session trace with ${String(session.generatedThoughts)} thought(s).`,
          mimeType: 'text/markdown',
          annotations: {
            lastModified: new Date(session.updatedAt).toISOString(),
          },
        })),
      }),
      complete: {
        sessionId: completeSessionIds,
      },
    }),
    {
      title: 'Reasoning Trace',
      description: 'Markdown trace of a reasoning session (full content).',
      mimeType: 'text/markdown',
      ...(withIconMeta(iconMeta) ?? {}),
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
            annotations: {
              lastModified: new Date(session.updatedAt).toISOString(),
            },
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
      ...(withIconMeta(iconMeta) ?? {}),
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
            annotations: {
              lastModified: new Date(session.updatedAt).toISOString(),
            },
          },
        ],
      };
    }
  );

  const sessionTemplate = new ResourceTemplate(
    'reasoning://sessions/{sessionId}',
    {
      list: () => ({
        resources: sessionStore.listSummaries().map((session) => ({
          uri: `${SESSION_RESOURCE_PREFIX}${session.id}`,
          name: `session-${shortSessionId(session.id)}`,
          title: `Reasoning Session ${shortSessionId(session.id)}`,
          description: `${session.level} session with ${String(
            session.generatedThoughts
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
      ...(withIconMeta(iconMeta) ?? {}),
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
