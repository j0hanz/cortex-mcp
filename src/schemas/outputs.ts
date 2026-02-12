import { z } from 'zod';

export const DefaultOutputSchema = z.strictObject({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .strictObject({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

const ReasoningThinkSuccessSchema = z.strictObject({
  ok: z.literal(true),
  result: z.strictObject({
    sessionId: z.string(),
    level: z.enum(['basic', 'normal', 'high']),
    status: z.enum(['active', 'completed', 'cancelled']),
    thoughts: z.array(
      z.strictObject({
        index: z.number(),
        content: z.string(),
        revision: z.number(),
      })
    ),
    generatedThoughts: z.number(),
    requestedThoughts: z.number(),
    totalThoughts: z.number(),
    tokenBudget: z
      .number()
      .describe(
        'Approximate token budget (UTF-8 bytes ÷ 4, not true tokenization)'
      ),
    tokensUsed: z
      .number()
      .describe(
        'Approximate tokens used (UTF-8 bytes ÷ 4, not true tokenization)'
      ),
    ttlMs: z.number(),
    expiresAt: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    remainingThoughts: z
      .number()
      .describe(
        'Number of thoughts remaining before the session reaches totalThoughts'
      ),
    summary: z
      .string()
      .describe(
        'Actionable next-step instruction when active, or completion status when done'
      ),
  }),
});

const ReasoningThinkErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
  }),
});

export const ReasoningThinkResultSchema = z.discriminatedUnion('ok', [
  ReasoningThinkSuccessSchema,
  ReasoningThinkErrorSchema,
]);

/**
 * Tool-facing output schema kept as a strict object so SDK tooling
 * can advertise outputSchema via tools/list.
 */
export const ReasoningThinkToolOutputSchema = z.strictObject({
  ok: z.boolean(),
  result: ReasoningThinkSuccessSchema.shape.result.optional(),
  error: z
    .strictObject({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type ReasoningThinkSuccess = z.infer<typeof ReasoningThinkSuccessSchema>;
