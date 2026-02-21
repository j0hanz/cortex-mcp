import { z } from 'zod';

const ErrorInfoSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});
const MISSING_RESULT_PATH: ['result'] = ['result'];
const MISSING_ERROR_PATH: ['error'] = ['error'];
const LEVEL_VALUES = ['basic', 'normal', 'high'] as const;
const STATUS_VALUES = ['active', 'completed', 'cancelled'] as const;
const ThoughtSchema = z.strictObject({
  index: z.number(),
  content: z.string(),
  revision: z.number(),
  stepSummary: z
    .string()
    .optional()
    .describe(
      'A 1-sentence summary of the conclusion reached in this step, if provided.'
    ),
});

export const DefaultOutputSchema = z.strictObject({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: ErrorInfoSchema.optional(),
});

const ReasoningThinkSuccessSchema = z.strictObject({
  ok: z.literal(true),
  result: z.strictObject({
    sessionId: z.string(),
    level: z.enum(LEVEL_VALUES),
    status: z.enum(STATUS_VALUES),
    thoughts: z.array(ThoughtSchema),
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
  error: ErrorInfoSchema,
});

export const ReasoningThinkResultSchema = z.discriminatedUnion('ok', [
  ReasoningThinkSuccessSchema,
  ReasoningThinkErrorSchema,
]);

function getMissingFieldIssue(data: {
  ok: boolean;
  result?: unknown;
  error?: unknown;
}): { message: string; path: ['result'] | ['error'] } | undefined {
  if (data.ok && data.result === undefined) {
    return {
      message: 'result is required when ok is true',
      path: MISSING_RESULT_PATH,
    };
  }

  if (!data.ok && data.error === undefined) {
    return {
      message: 'error is required when ok is false',
      path: MISSING_ERROR_PATH,
    };
  }

  return undefined;
}

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
    const missingFieldIssue = getMissingFieldIssue(data);

    if (missingFieldIssue) {
      ctx.addIssue({
        code: 'custom',
        message: missingFieldIssue.message,
        path: missingFieldIssue.path,
      });
    }
  });

export type ReasoningThinkSuccess = z.infer<typeof ReasoningThinkSuccessSchema>;
