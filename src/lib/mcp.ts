import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ContentBlock,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

import { sessionStore } from '../engine/reasoner.js';
import {
  type IconMeta,
  REASONING_LEVELS,
  type ReasoningLevel,
} from './types.js';
import { collectPrefixMatches } from './utils.js';

// --- completions.ts ---

const MAX_COMPLETION_RESULTS = 20;

export function completeSessionIds(value: string): string[] {
  return collectPrefixMatches(
    sessionStore.listSessionIds(),
    value,
    MAX_COMPLETION_RESULTS
  );
}

export function completeLevel(value: string): ReasoningLevel[] {
  const normalized = value.toLowerCase();
  const results: ReasoningLevel[] = [];
  for (const level of REASONING_LEVELS) {
    if (level.startsWith(normalized)) {
      results.push(level);
    }
  }
  return results;
}

// --- progress.ts ---

export type ProgressToken = string | number;

export function shouldEmitProgress(
  progress: number,
  total: number,
  level: ReasoningLevel | undefined
): boolean {
  if (progress <= 1 || progress >= total) {
    return true;
  }
  // Expert level: emit every 5 steps to reduce noise on 20-25 step sessions
  if (level === 'expert') {
    return progress % 5 === 0;
  }
  // High level: emit every 2 steps to reduce noise
  if (level === 'high') {
    return progress % 2 === 0;
  }
  // Basic/Normal: emit every step
  return true;
}

export async function notifyProgress(args: {
  server: McpServer;
  progressToken: ProgressToken;
  progress: number;
  total: number;
  message: string;
}): Promise<void> {
  const { server, progressToken, progress, total, message } = args;
  try {
    await server.server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total,
        message,
      },
    });
  } catch {
    // Ignore notification errors
  }
}

// --- tool-response.ts ---

export function withIconMeta(
  iconMeta?: IconMeta
): { icons: IconMeta[] } | undefined {
  return iconMeta ? { icons: [iconMeta] } : undefined;
}

function createStructuredTextBlock(structured: object): ContentBlock {
  return { type: 'text', text: JSON.stringify(structured) };
}

export function createToolResponse<T extends object>(
  structured: T,
  embeddedResource?: TextResourceContents
): {
  content: ContentBlock[];
  structuredContent: T;
} {
  const content: ContentBlock[] =
    embeddedResource === undefined
      ? [createStructuredTextBlock(structured)]
      : [
          createStructuredTextBlock(structured),
          { type: 'resource', resource: embeddedResource },
        ];

  return {
    content,
    structuredContent: structured,
  };
}

// --- tool-contracts.ts ---

export interface ToolContract {
  name: string;
  purpose: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  params: {
    name: string;
    type: string;
    required: boolean;
    constraints: string;
  }[];
  outputShape: string;
}

const TOOL_CONTRACTS: readonly ToolContract[] = [
  {
    name: 'reasoning_think',
    purpose:
      'Multi-step reasoning. Decomposes queries into sequential thought steps in a persistent session trace.',
    model: 'none (engine)',
    timeoutMs: 0,
    maxOutputTokens: 0,
    params: [
      {
        name: 'query',
        type: 'string',
        required: false,
        constraints: '1-10,000 chars',
      },
      {
        name: 'level',
        type: 'string',
        required: false,
        constraints: 'basic | normal | high | expert',
      },
      {
        name: 'runMode',
        type: 'string',
        required: false,
        constraints: 'step | run_to_completion',
      },
      {
        name: 'thought',
        type: 'string | string[]',
        required: false,
        constraints: '1-100,000 chars',
      },
      {
        name: 'targetThoughts',
        type: 'number',
        required: false,
        constraints: '1-25',
      },
      {
        name: 'sessionId',
        type: 'string',
        required: false,
        constraints: '1-128 chars',
      },
      {
        name: 'observation',
        type: 'string',
        required: false,
        constraints: 'optional',
      },
      {
        name: 'hypothesis',
        type: 'string',
        required: false,
        constraints: 'optional',
      },
      {
        name: 'evaluation',
        type: 'string',
        required: false,
        constraints: 'optional',
      },
      {
        name: 'step_summary',
        type: 'string',
        required: false,
        constraints: 'optional',
      },
      {
        name: 'is_conclusion',
        type: 'boolean',
        required: false,
        constraints: 'optional',
      },
      {
        name: 'rollback_to_step',
        type: 'number',
        required: false,
        constraints: 'optional',
      },
    ],
    outputShape:
      '{ok, result: {sessionId, query?, level, status, thoughts[], generatedThoughts, requestedThoughts, totalThoughts, remainingThoughts, tokenBudget, tokensUsed, ttlMs, expiresAt, createdAt, updatedAt, summary}}',
  },
];

export function getToolContracts(): readonly ToolContract[] {
  return TOOL_CONTRACTS;
}

// --- prompt-contracts.ts ---

export interface PromptContract {
  name: string;
  title: string;
  description: string;
}

const PROMPT_CONTRACTS: readonly PromptContract[] = [
  {
    name: 'get-help',
    title: 'Get Help',
    description: 'Return server usage instructions.',
  },
  {
    name: 'reasoning.basic',
    title: 'Reasoning Basic',
    description: 'Basic-depth reasoning (1-3 thoughts).',
  },
  {
    name: 'reasoning.normal',
    title: 'Reasoning Normal',
    description: 'Normal-depth reasoning (4-8 thoughts).',
  },
  {
    name: 'reasoning.high',
    title: 'Reasoning High',
    description: 'High-depth reasoning (10-15 thoughts).',
  },
  {
    name: 'reasoning.expert',
    title: 'Reasoning Expert',
    description: 'Expert-depth reasoning (20-25 thoughts).',
  },
  {
    name: 'reasoning.continue',
    title: 'Continue Reasoning',
    description: 'Continue an existing session. Optional follow-up query.',
  },
  {
    name: 'reasoning.retry',
    title: 'Retry Reasoning',
    description: 'Retry a failed reasoning task with modified parameters.',
  },
];

export function getPromptContracts(): readonly PromptContract[] {
  return PROMPT_CONTRACTS;
}
