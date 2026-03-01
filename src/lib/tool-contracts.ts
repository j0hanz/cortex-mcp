interface ToolContract {
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
      'Structured multi-step reasoning tool. Decomposes analysis into sequential thought steps stored in a persistent session trace.',
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
