import { z } from 'zod';

import { getLevelDescriptionString } from '../engine/config.js';

import { REASONING_LEVELS } from '../lib/types.js';
import { getTargetThoughtsError } from '../lib/validators.js';

const RUN_MODE_VALUES = ['step', 'run_to_completion'] as const;
const DEFAULT_RUN_MODE = 'step';
const LEVEL_SCHEMA = z.enum(REASONING_LEVELS);
const QUERY_TEXT_SCHEMA = z.string().min(1).max(10000);
const THOUGHT_TEXT_SCHEMA = z.string().min(1).max(100000);
const THOUGHT_BATCH_SCHEMA = z.array(THOUGHT_TEXT_SCHEMA).min(1).max(25);

function addCustomIssue(
  ctx: z.RefinementCtx,
  path: string[],
  message: string
): void {
  ctx.addIssue({
    code: 'custom',
    message,
    path,
  });
}

const ReasoningThinkInputBaseSchema = z.strictObject({
  query: QUERY_TEXT_SCHEMA.optional().describe(
    'Question or problem to analyze.'
  ),
  level: LEVEL_SCHEMA.optional().describe(
    `Reasoning depth level. Required for new sessions. ${getLevelDescriptionString()}.`
  ),
  targetThoughts: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Exact thought count. Must fit the level range.'),
  sessionId: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Session ID for continuation.'),
  runMode: z
    .enum(RUN_MODE_VALUES)
    .optional()
    .describe('Execution mode: "step" (default) or "run_to_completion".'),
  thought: z
    .union([THOUGHT_TEXT_SCHEMA, THOUGHT_BATCH_SCHEMA])
    .optional()
    .describe(
      'Reasoning text for this step. Stored verbatim. Use string for single-step mode, string[] for batch mode.'
    ),
  is_conclusion: z
    .boolean()
    .optional()
    .describe('End session early when the final answer is reached.'),
  rollback_to_step: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      '0-based thought index to rollback to. Later thoughts are discarded.'
    ),
  step_summary: z
    .string()
    .optional()
    .describe('One-sentence summary of this step.'),
  observation: z
    .string()
    .min(1)
    .optional()
    .describe('Facts known at this step.'),
  hypothesis: z
    .string()
    .min(1)
    .optional()
    .describe('Proposed next idea or logical step.'),
  evaluation: z
    .string()
    .min(1)
    .optional()
    .describe('Evaluation of the hypothesis.'),
});

export const ReasoningThinkInputSchema =
  ReasoningThinkInputBaseSchema.superRefine((data, ctx) => {
    const runMode = data.runMode ?? DEFAULT_RUN_MODE;

    if (data.sessionId === undefined && data.query === undefined) {
      addCustomIssue(
        ctx,
        ['query'],
        'query is required when sessionId is not provided'
      );
    }

    if (data.sessionId === undefined && data.level === undefined) {
      addCustomIssue(
        ctx,
        ['level'],
        'level is required when sessionId is not provided'
      );
    }

    if (
      runMode === 'run_to_completion' &&
      data.sessionId === undefined &&
      data.targetThoughts === undefined
    ) {
      addCustomIssue(
        ctx,
        ['targetThoughts'],
        'targetThoughts is required for run_to_completion when sessionId is not provided'
      );
    }

    if (runMode === 'step' && Array.isArray(data.thought)) {
      addCustomIssue(
        ctx,
        ['thought'],
        'thought must be a string when runMode is "step"'
      );
    }

    const hasThought = data.thought !== undefined;
    const hasStructured =
      data.observation !== undefined &&
      data.hypothesis !== undefined &&
      data.evaluation !== undefined;

    if (!hasThought && !hasStructured && data.rollback_to_step === undefined) {
      addCustomIssue(
        ctx,
        ['thought'],
        'Either "thought" or structured fields ("observation", "hypothesis", "evaluation") are required, unless rolling back.'
      );
    }

    if (data.targetThoughts === undefined || data.level === undefined) {
      return;
    }

    const error = getTargetThoughtsError(data.level, data.targetThoughts);
    if (error) {
      addCustomIssue(ctx, ['targetThoughts'], error);
    }
  });

export type ReasoningThinkInput = z.infer<typeof ReasoningThinkInputSchema>;
