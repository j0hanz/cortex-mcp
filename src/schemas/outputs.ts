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
    tokenBudget: z.number(),
    tokensUsed: z.number(),
    ttlMs: z.number(),
    expiresAt: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    summary: z.string(),
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
