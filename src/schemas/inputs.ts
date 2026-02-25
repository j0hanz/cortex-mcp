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

export const ReasoningThinkInputSchema = z
  .strictObject({
    query: QUERY_TEXT_SCHEMA.optional().describe(
      'The question or problem to reason about'
    ),
    level: LEVEL_SCHEMA.optional().describe(
      `Reasoning depth level (required for new sessions, optional for continuing). ${getLevelDescriptionString()}.`
    ),
    targetThoughts: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe(
        'Optional explicit thought count. Must fit the level range: basic 3–5, normal 6–10, high 15–25.'
      ),
    sessionId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe(
        'Session ID to continue. The session level is used when continuing; provided level is optional.'
      ),
    runMode: z
      .enum(RUN_MODE_VALUES)
      .optional()
      .describe(
        'Execution mode (default: "step"). "step" appends a single thought per call. "run_to_completion" consumes all supplied thought inputs in one request.'
      ),
    thought: z
      .union([THOUGHT_TEXT_SCHEMA, THOUGHT_BATCH_SCHEMA])
      .optional()
      .describe(
        'Your full reasoning content for this step. ' +
          'The server stores this text verbatim as the thought in the session trace. ' +
          'Write your complete analysis, observations, and conclusions here — this is what appears in trace.md. ' +
          'Can be a single string or an array of strings (for batch execution).'
      ),
    is_conclusion: z
      .boolean()
      .optional()
      .describe(
        'Set to true if you have arrived at the final answer and wish to end the reasoning session early.'
      ),
    rollback_to_step: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Set to a thought index (0-based) to rollback to. All thoughts after this index will be discarded.'
      ),
    step_summary: z
      .string()
      .optional()
      .describe(
        'A 1-sentence summary of the conclusion reached in this specific step.'
      ),
    observation: z
      .string()
      .optional()
      .describe('What facts are known at this step?'),
    hypothesis: z
      .string()
      .optional()
      .describe('What is the proposed idea or next logical leap?'),
    evaluation: z
      .string()
      .optional()
      .describe('Critique the hypothesis. Are there flaws?'),
  })
  .superRefine((data, ctx) => {
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
