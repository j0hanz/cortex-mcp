import { z } from 'zod';

import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { sessionStore } from '../engine/reasoner.js';

import {
  getPromptContracts,
  type PromptContract,
} from '../lib/prompt-contracts.js';
import type { IconMeta } from '../lib/types.js';

import { buildServerInstructions } from '../resources/instructions.js';

type PromptLevel = 'basic' | 'normal' | 'high';
const COMPLETION_LIMIT = 20;
const LEVEL_VALUES: readonly PromptLevel[] = ['basic', 'normal', 'high'];
const LEVEL_ENUM_SCHEMA = z.enum(LEVEL_VALUES);
const REASONING_TOOL_NAME = 'reasoning_think';
const THOUGHT_PARAMETER_GUIDANCE =
  'Provide your full reasoning in the "thought" parameter for each step.';

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

export function registerAllPrompts(
  server: McpServer,
  iconMeta?: IconMeta
): void {
  const contracts = getPromptContracts();
  const instructions = buildServerInstructions();

  // Helper to find contract
  const findContract = (name: string): PromptContract | undefined =>
    contracts.find((c) => c.name === name);

  // Register Level Prompts (reasoning.basic, .normal, .high)
  for (const level of LEVEL_VALUES) {
    const name = `reasoning.${level}`;
    const contract = findContract(name);
    if (!contract) {
      throw new Error(
        `Missing mandatory prompt contract for '${name}'. Check src/lib/prompt-contracts.ts.`
      );
    }

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
        const text = `Initiate a ${level}-depth reasoning session for the query: ${JSON.stringify(query)}. Use the "${REASONING_TOOL_NAME}" tool${formatTargetThoughts(targetThoughts)}. ${THOUGHT_PARAMETER_GUIDANCE} This is stored verbatim in the session trace. Repeat calls with the returned sessionId until totalThoughts is reached.`;
        return createTextPrompt(text);
      }
    );
  }

  // Register reasoning.retry
  const retryContract = findContract('reasoning.retry');
  if (!retryContract) {
    throw new Error(
      "Missing mandatory prompt contract 'reasoning.retry'. Check src/lib/prompt-contracts.ts."
    );
  }

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
      const text = `Retry the reasoning session for query: ${JSON.stringify(query)}. Use the "${REASONING_TOOL_NAME}" tool with level="${level}"${formatTargetThoughts(targetThoughts)}. ${THOUGHT_PARAMETER_GUIDANCE}`;
      return createTextPrompt(text);
    }
  );

  // Register get-help
  const helpContract = findContract('get-help');
  if (!helpContract) {
    throw new Error(
      "Missing mandatory prompt contract 'get-help'. Check src/lib/prompt-contracts.ts."
    );
  }

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
  const continueContract = findContract('reasoning.continue');
  if (!continueContract) {
    throw new Error(
      "Missing mandatory prompt contract 'reasoning.continue'. Check src/lib/prompt-contracts.ts."
    );
  }

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
      const followUpText =
        query === undefined ? '' : ` with follow-up: ${JSON.stringify(query)}`;
      const levelText = level === undefined ? '' : ` with level="${level}"`;
      const text = `Continue reasoning session ${JSON.stringify(sessionId)}${followUpText}. Use "${REASONING_TOOL_NAME}"${levelText}${formatTargetThoughts(targetThoughts)}. ${THOUGHT_PARAMETER_GUIDANCE}`;
      return createTextPrompt(text);
    }
  );
}
