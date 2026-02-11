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
    totalThoughts: z.number(),
    tokenBudget: z.number(),
    tokensUsed: z.number(),
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

export type ReasoningThinkResult = z.infer<typeof ReasoningThinkResultSchema>;
