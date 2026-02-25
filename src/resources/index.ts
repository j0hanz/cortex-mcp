import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { sessionStore } from '../engine/reasoner.js';

import { formatThoughtsToMarkdown } from '../lib/formatting.js';
import { withIconMeta } from '../lib/tool-response.js';
import type {
  IconMeta,
  ReasoningLevel,
  Session,
  SessionSummary as StoreSessionSummary,
} from '../lib/types.js';
import { collectPrefixMatches, parseBooleanEnv } from '../lib/validators.js';

import { buildServerInstructions } from './instructions.js';
import { buildToolCatalog } from './tool-catalog.js';
import { buildWorkflowGuide } from './workflows.js';

const SESSIONS_RESOURCE_URI = 'reasoning://sessions';
const SESSION_RESOURCE_PREFIX = `${SESSIONS_RESOURCE_URI}/`;
const TRACE_RESOURCE_PREFIX = 'file:///cortex/sessions/';
const REDACTED_THOUGHT_CONTENT = '[REDACTED]';

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
  level: ReasoningLevel;
  status: 'active' | 'completed' | 'cancelled';
  generatedThoughts: number;
  remainingThoughts: number;
  totalThoughts: number;
  tokenBudget: number;
  tokensUsed: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

function buildSessionSummary(
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
  return JSON.stringify(data);
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

const MAX_COMPLETION_RESULTS = 20;

function completeSessionIds(value: string): string[] {
  return collectPrefixMatches(
    sessionStore.listSessionIds(),
    value,
    MAX_COMPLETION_RESULTS
  );
}

function toIsoTimestamp(unixMs: number): string {
  return new Date(unixMs).toISOString();
}

function shouldRedactTraceContent(): boolean {
  return parseBooleanEnv('CORTEX_REDACT_TRACE_CONTENT', false);
}

function getSessionView(session: Readonly<Session>): Readonly<Session> {
  if (!shouldRedactTraceContent()) {
    return session;
  }

  return {
    ...session,
    thoughts: session.thoughts.map((thought) => ({
      index: thought.index,
      content: REDACTED_THOUGHT_CONTENT,
      revision: thought.revision,
      ...(thought.stepSummary !== undefined
        ? { stepSummary: REDACTED_THOUGHT_CONTENT }
        : {}),
    })),
  };
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
  const instructions = buildServerInstructions();
  const toolCatalog = buildToolCatalog();
  const workflows = buildWorkflowGuide();

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
    'tool-catalog',
    'internal://tool-catalog',
    {
      title: 'Tool Catalog',
      description: 'Tool reference: models, params, outputs, data flow.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.7 },
      ...(withIconMeta(iconMeta) ?? {}),
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: toolCatalog },
      ],
    })
  );

  server.registerResource(
    'workflows',
    'internal://workflows',
    {
      title: 'Workflows',
      description: 'Recommended workflows and tool sequences.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.7 },
      ...(withIconMeta(iconMeta) ?? {}),
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: workflows }],
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
      const sessions = sessionStore.listSummaries().map(buildSessionSummary);

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
            lastModified: toIsoTimestamp(session.updatedAt),
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
      const session = getSessionView(resolveSession(sessionId, uri));
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'text/markdown',
            text: formatThoughtsToMarkdown(session),
            annotations: {
              lastModified: toIsoTimestamp(session.updatedAt),
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
      const session = getSessionView(resolveSession(sessionId, uri));
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
              lastModified: toIsoTimestamp(session.updatedAt),
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
            lastModified: toIsoTimestamp(session.updatedAt),
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
      annotations: { audience: ['assistant', 'user'], priority: 0.8 },
      ...(withIconMeta(iconMeta) ?? {}),
    },
    (uri, variables) => {
      const sessionId = extractStringVariable(variables, 'sessionId', uri);
      const session = getSessionView(resolveSession(sessionId, uri));
      const generatedThoughts = session.thoughts.length;
      const summary = buildSessionSummary({ ...session, generatedThoughts });

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
                ...(thought.stepSummary !== undefined
                  ? { stepSummary: thought.stepSummary }
                  : {}),
              })),
            }),
          },
        ],
      };
    }
  );
}
