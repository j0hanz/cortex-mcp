import { z } from 'zod';

import { REASONING_LEVELS } from '../lib/types.js';

import { getLevelDescriptionString } from '../engine/config.js';

const RUN_MODE_VALUES = ['step', 'run_to_completion'] as const;
const LEVEL_SCHEMA = z.enum(REASONING_LEVELS);
const QUERY_TEXT_SCHEMA = z.string().min(1).max(10000);
const THOUGHT_TEXT_SCHEMA = z.string().min(1).max(100000);
const THOUGHT_BATCH_SCHEMA = z.array(THOUGHT_TEXT_SCHEMA).min(1).max(25);

export const ReasoningThinkInputSchema = z
  .strictObject({
    query: QUERY_TEXT_SCHEMA.optional().describe(
      'Question or problem to analyze.'
    ),
    level: LEVEL_SCHEMA.optional().describe(
      `Depth level. Required for new sessions. ${getLevelDescriptionString()}.`
    ),
    targetThoughts: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Exact step count. Must fit level range.'),
    sessionId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('Session ID to continue.'),
    runMode: z
      .enum(RUN_MODE_VALUES)
      .optional()
      .describe('"step" (default) or "run_to_completion".'),
    thought: z
      .union([THOUGHT_TEXT_SCHEMA, THOUGHT_BATCH_SCHEMA])
      .optional()
      .describe(
        'Reasoning text. Stored verbatim. String for step mode, string[] for batch.'
      ),
    isConclusion: z
      .boolean()
      .optional()
      .describe('End session early at final answer.'),
    rollbackToStep: z
      .number()
      .int()
      .min(0)
      .max(24)
      .optional()
      .describe('0-based index to rollback to. Discards later thoughts.'),
    stepSummary: z
      .string()
      .max(500)
      .optional()
      .describe('One-sentence step summary.'),
    observation: z
      .string()
      .min(1)
      .optional()
      .describe('Known facts at this step.'),
    hypothesis: z.string().min(1).optional().describe('Proposed next idea.'),
    evaluation: z
      .string()
      .min(1)
      .optional()
      .describe('Critique of hypothesis.'),
  })
  .superRefine((data, ctx) => {
    if (data.sessionId === undefined && data.query === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message:
          'query is required when starting a new session. Provide query + level + thought.',
      });
    }

    if (data.sessionId === undefined && data.level === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['level'],
        message:
          'level is required when starting a new session. Choose: basic, normal, high, expert.',
      });
    }

    const hasThought = data.thought !== undefined;
    const hasStructured =
      data.observation !== undefined &&
      data.hypothesis !== undefined &&
      data.evaluation !== undefined;

    if (!hasThought && !hasStructured && data.rollbackToStep === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['thought'],
        message:
          'Provide "thought", structured fields (observation + hypothesis + evaluation), or rollbackToStep.',
      });
    }

    const runMode = data.runMode ?? 'step';
    if (runMode === 'step' && Array.isArray(data.thought)) {
      ctx.addIssue({
        code: 'custom',
        path: ['thought'],
        message:
          'thought must be a string in step mode. Use runMode: "run_to_completion" for batch input.',
      });
    }
  });

export type ReasoningThinkInput = z.infer<typeof ReasoningThinkInputSchema>;
