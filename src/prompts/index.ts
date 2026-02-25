import { z } from 'zod';

import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { sessionStore } from '../engine/reasoner.js';

import {
  getPromptContracts,
  type PromptContract,
} from '../lib/prompt-contracts.js';
import { withIconMeta } from '../lib/tool-response.js';
import type { IconMeta, ReasoningLevel } from '../lib/types.js';
import { REASONING_LEVELS } from '../lib/types.js';
import { collectPrefixMatches } from '../lib/validators.js';

import { buildServerInstructions } from '../resources/instructions.js';

import { getTemplate } from './templates.js';

const COMPLETION_LIMIT = 20;
const LEVEL_ENUM_SCHEMA = z.enum(REASONING_LEVELS);
const REASONING_TOOL_NAME = 'reasoning_think';
const THOUGHT_PARAMETER_GUIDANCE =
  'Provide full reasoning in "thought" for every step.';

function completeSessionId(value: string): string[] {
  return collectPrefixMatches(
    sessionStore.listSessionIds(),
    value,
    COMPLETION_LIMIT
  );
}

function completeLevel(value: string): ReasoningLevel[] {
  const normalized = value.toLowerCase();
  const results: ReasoningLevel[] = [];
  for (const level of REASONING_LEVELS) {
    if (level.startsWith(normalized)) {
      results.push(level);
    }
  }
  return results;
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

function buildPromptText(args: {
  context: string[];
  task: string[];
  constraints: string[];
  output: string[];
}): string {
  const { context, task, constraints, output } = args;
  return [
    '<context>',
    ...context,
    '</context>',
    '',
    '<task>',
    ...task,
    '</task>',
    '',
    '<constraints>',
    ...constraints.map((line) => `- ${line}`),
    '</constraints>',
    '',
    '<output_format>',
    ...output,
    '</output_format>',
  ].join('\n');
}

function buildStartReasoningPrompt(args: {
  level: ReasoningLevel;
  query: string;
  targetThoughts?: number;
}): string {
  const { level, query, targetThoughts } = args;
  const base = buildPromptText({
    context: [
      `Query: ${JSON.stringify(query)}`,
      `Requested level: ${level}`,
      `Target thoughts: ${
        targetThoughts === undefined
          ? 'use level default'
          : String(targetThoughts)
      }`,
    ],
    task: [
      `Start a new reasoning session using "${REASONING_TOOL_NAME}".`,
      'Create the first step with a complete, concrete reasoning thought.',
    ],
    constraints: [
      THOUGHT_PARAMETER_GUIDANCE,
      'Preserve sessionId from the response for continuation calls.',
      'Continue until status is completed or remainingThoughts is 0.',
    ],
    output: [
      'Return the first tool call payload only.',
      'Fields: query, level, thought, and optional targetThoughts.',
    ],
  });
  return `${base}\n\n${getTemplate(level)}`;
}

function buildRetryReasoningPrompt(args: {
  query: string;
  level: ReasoningLevel;
  targetThoughts?: number;
}): string {
  const { query, level, targetThoughts } = args;
  const base = buildPromptText({
    context: [
      `Retry query: ${JSON.stringify(query)}`,
      `Retry level: ${level}`,
      `Target thoughts: ${
        targetThoughts === undefined
          ? 'unchanged / default'
          : String(targetThoughts)
      }`,
    ],
    task: [
      `Retry by calling "${REASONING_TOOL_NAME}" with an improved first thought.`,
    ],
    constraints: [
      THOUGHT_PARAMETER_GUIDANCE,
      'Use a direct and specific thought with no filler language.',
    ],
    output: [
      'Return one tool call payload only.',
      'Fields: query, level, thought, and optional targetThoughts.',
    ],
  });
  return `${base}\n\n${getTemplate(level)}`;
}

function buildContinueReasoningPrompt(args: {
  sessionId: string;
  query?: string;
  level?: ReasoningLevel;
  targetThoughts?: number;
}): string {
  const { sessionId, query, level, targetThoughts } = args;
  return buildPromptText({
    context: [
      `Session: ${JSON.stringify(sessionId)}`,
      query === undefined
        ? 'Follow-up query: none provided'
        : `Follow-up query: ${JSON.stringify(query)}`,
      level === undefined
        ? 'Level: keep session level'
        : `Level override: ${level}`,
      `Target thoughts: ${
        targetThoughts === undefined
          ? 'unchanged / default'
          : String(targetThoughts)
      }`,
    ],
    task: [
      `Continue the existing session using "${REASONING_TOOL_NAME}".`,
      'Generate the next reasoning step only.',
    ],
    constraints: [
      THOUGHT_PARAMETER_GUIDANCE,
      'Keep the same sessionId in the call payload.',
      'Prefer concise, concrete reasoning over meta commentary.',
    ],
    output: [
      'Return one continuation tool call payload only.',
      'Fields: sessionId, thought, and optional query/level/targetThoughts.',
    ],
  });
}

export function registerAllPrompts(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  const contracts = getPromptContracts();
  const instructions = buildServerInstructions();
  const contractByName = new Map<string, PromptContract>(
    contracts.map((contract) => [contract.name, contract])
  );
  const getRequiredContract = (name: string): PromptContract => {
    const contract = contractByName.get(name);
    if (!contract) {
      throw new Error(
        `Missing mandatory prompt contract for '${name}'. Check src/lib/prompt-contracts.ts.`
      );
    }
    return contract;
  };

  // Register Level Prompts (reasoning.basic, .normal, .high)
  for (const level of REASONING_LEVELS) {
    const name = `reasoning.${level}`;
    const contract = getRequiredContract(name);

    server.registerPrompt(
      name,
      {
        title: contract.title,
        description: contract.description,
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
        const text = buildStartReasoningPrompt({
          level,
          query,
          ...(targetThoughts !== undefined ? { targetThoughts } : {}),
        });
        return createTextPrompt(text);
      }
    );
  }

  // Register reasoning.retry
  const retryContract = getRequiredContract('reasoning.retry');

  server.registerPrompt(
    retryContract.name,
    {
      title: retryContract.title,
      description: retryContract.description,
      ...(withIconMeta(iconMeta) ?? {}),
      argsSchema: {
        query: z
          .string()
          .min(1)
          .max(10000)
          .describe('The original or modified query'),
        level: completable(
          LEVEL_ENUM_SCHEMA.describe('The reasoning level to use'),
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
      const text = buildRetryReasoningPrompt({
        query,
        level,
        ...(targetThoughts !== undefined ? { targetThoughts } : {}),
      });
      return createTextPrompt(text);
    }
  );

  // Register get-help
  const helpContract = getRequiredContract('get-help');

  server.registerPrompt(
    helpContract.name,
    {
      title: helpContract.title,
      description: helpContract.description,
      ...(withIconMeta(iconMeta) ?? {}),
    },
    () => createTextPrompt(instructions)
  );

  // Register reasoning.continue
  const continueContract = getRequiredContract('reasoning.continue');

  server.registerPrompt(
    continueContract.name,
    {
      title: continueContract.title,
      description: continueContract.description,
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
          LEVEL_ENUM_SCHEMA.optional().describe(
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
      const text = buildContinueReasoningPrompt({
        sessionId,
        ...(query !== undefined ? { query } : {}),
        ...(level !== undefined ? { level } : {}),
        ...(targetThoughts !== undefined ? { targetThoughts } : {}),
      });
      return createTextPrompt(text);
    }
  );
}
