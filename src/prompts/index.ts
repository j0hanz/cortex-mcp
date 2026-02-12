import { z } from 'zod';

import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { sessionStore } from '../engine/reasoner.js';

import { loadInstructions } from '../lib/instructions.js';
import type { IconMeta } from '../lib/types.js';

type PromptLevel = 'basic' | 'normal' | 'high';
const COMPLETION_LIMIT = 20;
const LEVEL_VALUES: PromptLevel[] = ['basic', 'normal', 'high'];

function levelTitle(level: PromptLevel): string {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatTargetThoughts(targetThoughts?: number): string {
  if (targetThoughts === undefined) {
    return '';
  }
  return `, targetThoughts=${String(targetThoughts)}`;
}

function completeSessionId(value: string): string[] {
  const results: string[] = [];
  for (const session of sessionStore.list()) {
    if (!session.id.startsWith(value)) {
      continue;
    }
    results.push(session.id);
    if (results.length >= COMPLETION_LIMIT) {
      break;
    }
  }
  return results;
}

function completeLevel(value: string): PromptLevel[] {
  const normalized = value.toLowerCase();
  return LEVEL_VALUES.filter((level) => level.startsWith(normalized));
}

function registerLevelPrompt(
  server: McpServer,
  level: PromptLevel,
  iconMeta?: IconMeta
): void {
  server.registerPrompt(
    `reasoning.${level}`,
    {
      title: `Reasoning ${levelTitle(level)}`,
      description: `Prepare a ${level}-depth reasoning request.`,
      ...(iconMeta
        ? {
            icons: [iconMeta],
          }
        : {}),
      argsSchema: {
        query: z
          .string()
          .min(1)
          .max(10000)
          .describe('The question or problem to reason about'),
        targetThoughts: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe(
            'Optional exact step count within the selected level range (max 25)'
          ),
      },
    },
    ({ query, targetThoughts }) => {
      // Create user message
      const text = `Initiate a ${level}-depth reasoning session for the query: ${JSON.stringify(query)}. Use the "reasoning.think" tool${formatTargetThoughts(targetThoughts)}. For each call, provide your full reasoning in the "thought" parameter — this is stored verbatim in the session trace. Repeat calls with the returned sessionId until totalThoughts is reached.`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text,
            },
          },
        ],
      };
    }
  );
}

export function registerAllPrompts(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  registerLevelPrompt(server, 'basic', iconMeta);
  registerLevelPrompt(server, 'normal', iconMeta);
  registerLevelPrompt(server, 'high', iconMeta);

  server.registerPrompt(
    'reasoning.retry',
    {
      title: 'Retry Reasoning',
      description: 'Retry a failed reasoning task with modified parameters.',
      ...(iconMeta
        ? {
            icons: [iconMeta],
          }
        : {}),
      argsSchema: {
        query: z
          .string()
          .min(1)
          .max(10000)
          .describe('The original or modified query'),
        level: completable(
          z
            .enum(['basic', 'normal', 'high'])
            .describe('The reasoning level to use'),
          (value) => completeLevel(value)
        ),
        targetThoughts: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe('Optional exact step count'),
      },
    },
    ({ query, level, targetThoughts }) => {
      const text = `Retry the reasoning session for query: ${JSON.stringify(query)}. Use the "reasoning.think" tool with level="${level}"${formatTargetThoughts(targetThoughts)}. Provide your full reasoning in the "thought" parameter for each step.`;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text,
            },
          },
        ],
      };
    }
  );

  const instructions = loadInstructions();

  server.registerPrompt(
    'get-help',
    {
      title: 'Get Help',
      description: 'Return the server usage instructions.',
      ...(iconMeta
        ? {
            icons: [iconMeta],
          }
        : {}),
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: instructions },
        },
      ],
    })
  );

  server.registerPrompt(
    'reasoning.continue',
    {
      title: 'Continue Reasoning',
      description:
        'Continue an existing reasoning session with a follow-up query.',
      ...(iconMeta
        ? {
            icons: [iconMeta],
          }
        : {}),
      argsSchema: {
        sessionId: completable(
          z
            .string()
            .min(1)
            .max(128)
            .describe('Existing session ID to continue'),
          (value) => completeSessionId(value)
        ),
        query: z
          .string()
          .min(1)
          .max(10000)
          .optional()
          .describe('Follow-up query for the existing session'),
        level: completable(
          z
            .enum(['basic', 'normal', 'high'])
            .describe('Must match the session level'),
          (value) => completeLevel(value)
        ),
        targetThoughts: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe(
            'Optional exact step count within the selected level range (max 25)'
          ),
      },
    },
    ({ sessionId, query, level, targetThoughts }) => {
      const followUpText =
        query === undefined ? '' : ` with follow-up: ${JSON.stringify(query)}`;
      const text = `Continue reasoning session ${JSON.stringify(sessionId)}${followUpText}. Use "reasoning.think" with level="${level}"${formatTargetThoughts(targetThoughts)}. Provide your reasoning in the "thought" parameter for each step.`;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text,
            },
          },
        ],
      };
    }
  );
}
