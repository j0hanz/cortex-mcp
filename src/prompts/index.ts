import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type PromptLevel = 'basic' | 'normal' | 'high';

function levelTitle(level: PromptLevel): string {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatTargetThoughts(targetThoughts: number | undefined): string {
  if (targetThoughts === undefined) {
    return '';
  }
  return `, targetThoughts=${String(targetThoughts)}`;
}

function registerLevelPrompt(server: McpServer, level: PromptLevel): void {
  server.registerPrompt(
    `reasoning.${level}`,
    {
      title: `Reasoning ${levelTitle(level)}`,
      description: `Prepare a ${level}-depth reasoning request.`,
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
          .max(100)
          .optional()
          .describe(
            'Optional exact step count within the selected level range'
          ),
      },
    },
    ({ query, targetThoughts }) => ({
      description: `Template for a ${level}-depth reasoning run.`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use tool "reasoning.think" with query=${JSON.stringify(query)}, level="${level}"${formatTargetThoughts(targetThoughts)}.`,
          },
        },
      ],
    })
  );
}

export function registerAllPrompts(server: McpServer): void {
  registerLevelPrompt(server, 'basic');
  registerLevelPrompt(server, 'normal');
  registerLevelPrompt(server, 'high');

  server.registerPrompt(
    'reasoning.continue',
    {
      title: 'Continue Reasoning',
      description:
        'Continue an existing reasoning session with a follow-up query.',
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
          .max(100)
          .optional()
          .describe(
            'Optional exact step count within the selected level range'
          ),
      },
    },
    ({ sessionId, query, level, targetThoughts }) => ({
      description: 'Template for follow-up reasoning in an existing session.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use tool "reasoning.think" with sessionId=${JSON.stringify(sessionId)}, query=${JSON.stringify(query)}, level="${level}"${formatTargetThoughts(targetThoughts)}.`,
          },
        },
      ],
    })
  );
}
