import { z } from 'zod';

export interface PromptArg {
  name: string;
  type: z.ZodType;
  description: string;
  required: boolean;
}

export interface PromptContract {
  name: string;
  title: string;
  description: string;
  args: PromptArg[];
}

export function getPromptContracts(): PromptContract[] {
  return [
    {
      name: 'get-help',
      title: 'Get Help',
      description: 'Return the server usage instructions.',
      args: [],
    },
    {
      name: 'reasoning.basic',
      title: 'Reasoning Basic',
      description: 'Prepare a basic-depth reasoning request (3–5 thoughts).',
      args: [
        {
          name: 'query',
          type: z.string().min(1).max(10000),
          description: 'The question or problem to reason about',
          required: true,
        },
        {
          name: 'targetThoughts',
          type: z.number().int().min(1).max(25),
          description: 'Optional exact step count within the selected level range (max 25)',
          required: false,
        },
      ],
    },
    {
      name: 'reasoning.normal',
      title: 'Reasoning Normal',
      description: 'Prepare a normal-depth reasoning request (6–10 thoughts).',
      args: [
        {
          name: 'query',
          type: z.string().min(1).max(10000),
          description: 'The question or problem to reason about',
          required: true,
        },
        {
          name: 'targetThoughts',
          type: z.number().int().min(1).max(25),
          description: 'Optional exact step count within the selected level range (max 25)',
          required: false,
        },
      ],
    },
    {
      name: 'reasoning.high',
      title: 'Reasoning High',
      description: 'Prepare a high-depth reasoning request (15–25 thoughts).',
      args: [
        {
          name: 'query',
          type: z.string().min(1).max(10000),
          description: 'The question or problem to reason about',
          required: true,
        },
        {
          name: 'targetThoughts',
          type: z.number().int().min(1).max(25),
          description: 'Optional exact step count within the selected level range (max 25)',
          required: false,
        },
      ],
    },
    {
      name: 'reasoning.continue',
      title: 'Continue Reasoning',
      description: 'Continue an existing reasoning session (follow-up query optional).',
      args: [
        {
          name: 'sessionId',
          type: z.string().min(1).max(128),
          description: 'Existing session ID to continue',
          required: true,
        },
        {
          name: 'query',
          type: z.string().min(1).max(10000),
          description: 'Follow-up query for the existing session',
          required: false,
        },
        {
          name: 'level',
          type: z.enum(['basic', 'normal', 'high']),
          description: 'Optional in the tool; session level is used if provided',
          required: false,
        },
        {
          name: 'targetThoughts',
          type: z.number().int().min(1).max(25),
          description: 'Optional exact step count within the selected level range (max 25)',
          required: false,
        },
      ],
    },
    {
      name: 'reasoning.retry',
      title: 'Retry Reasoning',
      description: 'Retry a failed reasoning task with modified parameters.',
      args: [
        {
          name: 'query',
          type: z.string().min(1).max(10000),
          description: 'The original or modified query',
          required: true,
        },
        {
          name: 'level',
          type: z.enum(['basic', 'normal', 'high']),
          description: 'The reasoning level to use',
          required: true,
        },
        {
          name: 'targetThoughts',
          type: z.number().int().min(1).max(25),
          description: 'Optional exact step count',
          required: false,
        },
      ],
    },
  ];
}
