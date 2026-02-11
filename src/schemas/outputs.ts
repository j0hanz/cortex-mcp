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

export const ReasoningThinkResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
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
    })
    .optional(),
  error: z
    .strictObject({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type ReasoningThinkResult = z.infer<typeof ReasoningThinkResultSchema>;
