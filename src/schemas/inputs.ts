import { z } from 'zod';

import { getTargetThoughtsError } from '../lib/validators.js';

export const ReasoningThinkInputSchema = z
  .strictObject({
    query: z
      .string()
      .min(1)
      .max(10000)
      .describe('The question or problem to reason about'),
    level: z
      .enum(['basic', 'normal', 'high'])
      .describe('Reasoning depth level'),
    targetThoughts: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional explicit thought count. Must fit the selected level range.'
      ),
    sessionId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('Optional session ID to continue a previous reasoning session'),
    thought: z
      .string()
      .min(1)
      .max(100000)
      .optional()
      .describe(
        'Optional LLM-authored reasoning content for this step. ' +
          'When provided, the server stores this text as the thought content instead of generating a template. ' +
          'Use this to capture the full reasoning the LLM produces at each step.'
      ),
  })
  .superRefine((data, ctx) => {
    if (data.targetThoughts === undefined) {
      return;
    }

    const error = getTargetThoughtsError(data.level, data.targetThoughts);
    if (error) {
      ctx.addIssue({
        code: 'custom',
        message: error,
        path: ['targetThoughts'],
      });
    }
  });

export type ReasoningThinkInput = z.infer<typeof ReasoningThinkInputSchema>;
