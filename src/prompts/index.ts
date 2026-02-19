import { z } from 'zod';

import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { sessionStore } from '../engine/reasoner.js';

import { loadInstructions } from '../lib/instructions.js';
import type { IconMeta } from '../lib/types.js';

type PromptLevel = 'basic' | 'normal' | 'high';
const COMPLETION_LIMIT = 20;
const LEVEL_VALUES: readonly PromptLevel[] = ['basic', 'normal', 'high'];
const LEVEL_TITLES: Readonly<Record<PromptLevel, string>> = {
  basic: 'Basic',
  normal: 'Normal',
  high: 'High',
};
const REASONING_TOOL_NAME = 'reasoning_think';
const THOUGHT_PARAMETER_GUIDANCE =
  'Provide your full reasoning in the "thought" parameter for each step.';

function levelTitle(level: PromptLevel): string {
  return LEVEL_TITLES[level];
}

function formatTargetThoughts(targetThoughts?: number): string {
  if (targetThoughts === undefined) {
    return '';
  }
  return `, targetThoughts=${String(targetThoughts)}`;
}

function completeSessionId(value: string): string[] {
  const results: string[] = [];
  for (const sessionId of sessionStore.listSessionIds()) {
    if (!sessionId.startsWith(value)) {
      continue;
    }
    results.push(sessionId);
    if (results.length >= COMPLETION_LIMIT) {
      break;
    }
  }
  return results;
}

function completeLevel(value: string): PromptLevel[] {
  const normalized = value.toLowerCase();
  const results: PromptLevel[] = [];
  for (const level of LEVEL_VALUES) {
    if (level.startsWith(normalized)) {
      results.push(level);
    }
  }
  return results;
}

function withIconMeta(iconMeta?: IconMeta): { icons: IconMeta[] } | undefined {
  return iconMeta ? { icons: [iconMeta] } : undefined;
}

function createTextPrompt(text: string): {
  messages: [{ role: 'user'; content: { type: 'text'; text: string } }];
} {
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
      ...(withIconMeta(iconMeta) ?? {}),
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
      const text = `Initiate a ${level}-depth reasoning session for the query: ${JSON.stringify(query)}. Use the "${REASONING_TOOL_NAME}" tool${formatTargetThoughts(targetThoughts)}. ${THOUGHT_PARAMETER_GUIDANCE} This is stored verbatim in the session trace. Repeat calls with the returned sessionId until totalThoughts is reached.`;

      return createTextPrompt(text);
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
      ...(withIconMeta(iconMeta) ?? {}),
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
      const text = `Retry the reasoning session for query: ${JSON.stringify(query)}. Use the "${REASONING_TOOL_NAME}" tool with level="${level}"${formatTargetThoughts(targetThoughts)}. ${THOUGHT_PARAMETER_GUIDANCE}`;
      return createTextPrompt(text);
    }
  );

  const instructions = loadInstructions();

  server.registerPrompt(
    'get-help',
    {
      title: 'Get Help',
      description: 'Return the server usage instructions.',
      ...(withIconMeta(iconMeta) ?? {}),
    },
    () => createTextPrompt(instructions)
  );

  server.registerPrompt(
    'reasoning.continue',
    {
      title: 'Continue Reasoning',
      description:
        'Continue an existing reasoning session with a follow-up query.',
      ...(withIconMeta(iconMeta) ?? {}),
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
            .optional()
            .describe(
              'Optional in the tool; session level is used if provided'
            ),
          (value) => completeLevel(value ?? '')
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
      const levelText = level === undefined ? '' : ` with level="${level}"`;
      const text = `Continue reasoning session ${JSON.stringify(sessionId)}${followUpText}. Use "${REASONING_TOOL_NAME}"${levelText}${formatTargetThoughts(targetThoughts)}. ${THOUGHT_PARAMETER_GUIDANCE}`;
      return createTextPrompt(text);
    }
  );
}
