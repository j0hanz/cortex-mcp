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
  'Provide complete reasoning in "thought" for every call.';

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

function assignIfDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
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

function buildReasoningPrompt(args: {
  context: string[];
  task: string[];
  constraints: string[];
  output: string[];
  templateLevel?: ReasoningLevel;
}): string {
  const { templateLevel, ...sections } = args;
  const base = buildPromptText(sections);
  if (templateLevel === undefined) {
    return base;
  }
  return `${base}\n\n${getTemplate(templateLevel)}`;
}

function buildStartReasoningPrompt(args: {
  level: ReasoningLevel;
  query: string;
  targetThoughts?: number;
}): string {
  const { level, query, targetThoughts } = args;
  return buildReasoningPrompt({
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
      `Start new reasoning session via "${REASONING_TOOL_NAME}".`,
      'Generate the first concrete reasoning step now.',
    ],
    constraints: [
      THOUGHT_PARAMETER_GUIDANCE,
      'Preserve sessionId for continuation.',
      'Continue until status="completed" or remainingThoughts=0.',
      'No meta commentary.',
    ],
    output: [
      'Return exactly one tool payload. No prose.',
      'Required fields: query, level, thought.',
    ],
    templateLevel: level,
  });
}

function buildRetryReasoningPrompt(args: {
  query: string;
  level: ReasoningLevel;
  targetThoughts?: number;
}): string {
  const { query, level, targetThoughts } = args;
  return buildReasoningPrompt({
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
      `Retry calling "${REASONING_TOOL_NAME}" with an improved first thought.`,
    ],
    constraints: [
      THOUGHT_PARAMETER_GUIDANCE,
      'Write a direct, specific thought. No filler.',
      'No meta commentary.',
    ],
    output: [
      'Return exactly one tool payload. No prose.',
      'Required fields: query, level, thought.',
    ],
    templateLevel: level,
  });
}

function buildContinueReasoningPrompt(args: {
  sessionId: string;
  query?: string;
  level?: ReasoningLevel;
}): string {
  const { sessionId, query, level } = args;
  return buildReasoningPrompt({
    context: [
      `Session: ${JSON.stringify(sessionId)}`,
      query === undefined
        ? 'Follow-up query: none provided'
        : `Follow-up query: ${JSON.stringify(query)}`,
      level === undefined
        ? 'Level: keep session level'
        : `Level override: ${level}`,
    ],
    task: [
      `Continue session via "${REASONING_TOOL_NAME}".`,
      'Generate the next reasoning step.',
    ],
    constraints: [
      THOUGHT_PARAMETER_GUIDANCE,
      'Keep the same sessionId.',
      'Write concrete reasoning. No meta commentary.',
    ],
    output: [
      'Return exactly one continuation tool payload. No prose.',
      'Required fields: sessionId, thought.',
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
            .describe('Question or problem to reason about.'),
          targetThoughts: z
            .number()
            .int()
            .min(1)
            .max(25)
            .optional()
            .describe('Optional exact step count in the level range (max 25).'),
        },
      },
      ({ query, targetThoughts }) => {
        const promptArgs: Parameters<typeof buildStartReasoningPrompt>[0] = {
          level,
          query,
        };
        assignIfDefined(promptArgs, 'targetThoughts', targetThoughts);
        const text = buildStartReasoningPrompt(promptArgs);
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
          .describe('Original or revised query.'),
        level: completable(
          LEVEL_ENUM_SCHEMA.describe('Reasoning level to use.'),
          (value) => completeLevel(value)
        ),
        targetThoughts: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe('Optional exact step count.'),
      },
    },
    ({ query, level, targetThoughts }) => {
      const promptArgs: Parameters<typeof buildRetryReasoningPrompt>[0] = {
        query,
        level,
      };
      assignIfDefined(promptArgs, 'targetThoughts', targetThoughts);
      const text = buildRetryReasoningPrompt(promptArgs);
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
            .describe('Existing session ID to continue.'),
          (value) => completeSessionId(value)
        ),
        query: z
          .string()
          .min(1)
          .max(10000)
          .optional()
          .describe('Optional follow-up query.'),
        level: completable(
          LEVEL_ENUM_SCHEMA.optional().describe(
            'Optional level override; otherwise use the session level.'
          ),
          (value) => completeLevel(value ?? '')
        ),
      },
    },
    ({ sessionId, query, level }) => {
      const promptArgs: Parameters<typeof buildContinueReasoningPrompt>[0] = {
        sessionId,
      };
      assignIfDefined(promptArgs, 'query', query);
      assignIfDefined(promptArgs, 'level', level);
      const text = buildContinueReasoningPrompt(promptArgs);
      return createTextPrompt(text);
    }
  );
}
