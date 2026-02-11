import { z } from 'zod';

export const ReasoningThinkInputSchema = z.strictObject({
  query: z
    .string()
    .min(1)
    .max(10000)
    .describe('The question or problem to reason about'),
  level: z.enum(['basic', 'normal', 'high']).describe('Reasoning depth level'),
  targetThoughts: z
    .number()
    .int()
    .min(1)
    .max(100)
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
});

export type ReasoningThinkInput = z.infer<typeof ReasoningThinkInputSchema>;
