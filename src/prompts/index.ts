import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadInstructions } from '../lib/instructions.js';
import type { IconMeta } from '../lib/types.js';

type PromptLevel = 'basic' | 'normal' | 'high';

function levelTitle(level: PromptLevel): string {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatTargetThoughts(targetThoughts?: number): string {
  if (targetThoughts === undefined) {
    return '';
  }
  return `, targetThoughts=${String(targetThoughts)}`;
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
      const text = `Use tool "reasoning.think" with query=${JSON.stringify(query)}, level="${level}"${formatTargetThoughts(targetThoughts)}.`;

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
        level: z
          .enum(['basic', 'normal', 'high'])
          .describe('The reasoning level to use'),
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
      const text = `Use tool "reasoning.think" with query=${JSON.stringify(query)}, level="${level}"${formatTargetThoughts(targetThoughts)}.`;
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
        sessionId: z
          .string()
          .min(1)
          .max(128)
          .describe('Existing session ID to continue'),
        query: z
          .string()
          .min(1)
          .max(10000)
          .describe('Follow-up query for the existing session'),
        level: z
          .enum(['basic', 'normal', 'high'])
          .describe('Must match the session level'),
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
      const text = `Use tool "reasoning.think" with sessionId=${JSON.stringify(sessionId)}, query=${JSON.stringify(query)}, level="${level}"${formatTargetThoughts(targetThoughts)}.`;
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
