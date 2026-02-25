import { z } from 'zod';

import { REASONING_LEVELS, SESSION_STATUSES } from '../lib/types.js';

const ErrorInfoSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});
const MISSING_RESULT_PATH: ['result'] = ['result'];
const MISSING_ERROR_PATH: ['error'] = ['error'];
const ThoughtSchema = z.strictObject({
  index: z.number(),
  content: z.string(),
  revision: z.number(),
  stepSummary: z
    .string()
    .optional()
    .describe('1-sentence summary of the conclusion reached.'),
});

const ReasoningThinkSuccessSchema = z.strictObject({
  ok: z.literal(true),
  result: z.strictObject({
    sessionId: z.string(),
    query: z
      .string()
      .optional()
      .describe('Original query text for this session.'),
    level: z.enum(REASONING_LEVELS),
    status: z.enum(SESSION_STATUSES),
    thoughts: z.array(ThoughtSchema),
    generatedThoughts: z.number(),
    requestedThoughts: z.number(),
    totalThoughts: z.number(),
    tokenBudget: z.number().describe('Approximate token budget.'),
    tokensUsed: z.number().describe('Approximate tokens used.'),
    ttlMs: z.number(),
    expiresAt: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    remainingThoughts: z
      .number()
      .describe('Thoughts remaining before reaching totalThoughts.'),
    summary: z
      .string()
      .describe('Actionable next-step instruction or completion status.'),
  }),
});

const ReasoningThinkErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: ErrorInfoSchema,
});

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

/** Generic ok/error envelope — useful for contract tests and external validators. */
export const DefaultOutputSchema = z.union([
  z.strictObject({ ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: ErrorInfoSchema }),
]);

/** Full discriminated union for the reasoning_think tool result. */
export const ReasoningThinkResultSchema = z.union([
  ReasoningThinkSuccessSchema,
  ReasoningThinkErrorSchema,
]);
