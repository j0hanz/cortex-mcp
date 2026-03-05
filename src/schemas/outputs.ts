import { z } from 'zod';

import { REASONING_LEVELS, SESSION_STATUSES } from '../lib/types.js';

const ErrorInfoSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});
const ThoughtSchema = z.strictObject({
  index: z.number(),
  content: z.string(),
  revision: z.number(),
  stepSummary: z.string().optional().describe('One-sentence step summary.'),
});

const ReasoningThinkSuccessSchema = z.strictObject({
  ok: z.literal(true),
  result: z.strictObject({
    sessionId: z.string(),
    query: z.string().optional().describe('Original session query.'),
    level: z.enum(REASONING_LEVELS),
    status: z.enum(SESSION_STATUSES),
    thoughts: z.array(ThoughtSchema),
    generatedThoughts: z.number(),
    requestedThoughts: z.number(),
    totalThoughts: z.number(),
    tokenBudget: z.number().describe('Approximate token budget.'),
    tokensUsed: z.number().describe('Approximate tokens consumed.'),
    ttlMs: z.number(),
    expiresAt: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    remainingThoughts: z
      .number()
      .describe('Thoughts remaining until totalThoughts.'),
    summary: z.string().describe('Next action or completion status.'),
  }),
});
const MISSING_RESULT_PATH: ['result'] = ['result'];
const MISSING_ERROR_PATH: ['error'] = ['error'];

/**
 * Tool-facing output schema kept as a strict object so SDK tooling
 * can advertise outputSchema via tools/list.
 */
export const ReasoningThinkToolOutputSchema = z
  .strictObject({
    ok: z.boolean(),
    result: ReasoningThinkSuccessSchema.shape.result.optional(),
    error: ErrorInfoSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ok) {
      if (data.result === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'result is required when ok is true',
          path: MISSING_RESULT_PATH,
        });
      }
      if (data.error !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'error must be omitted when ok is true',
          path: MISSING_ERROR_PATH,
        });
      }
      return;
    }

    if (data.error === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'error is required when ok is false',
        path: MISSING_ERROR_PATH,
      });
    }
    if (data.result !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'result must be omitted when ok is false',
        path: MISSING_RESULT_PATH,
      });
    }
  });

export type ReasoningThinkSuccess = z.infer<typeof ReasoningThinkSuccessSchema>;
