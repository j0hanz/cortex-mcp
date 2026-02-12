import { z } from 'zod';

import { getTargetThoughtsError } from '../lib/validators.js';

export const ReasoningThinkInputSchema = z
  .strictObject({
    query: z
      .string()
      .min(1)
      .max(10000)
      .optional()
      .describe('The question or problem to reason about'),
    level: z
      .enum(['basic', 'normal', 'high'])
      .describe('Reasoning depth level'),
    targetThoughts: z
      .number()
      .int()
      .min(1)
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
        'Session ID to continue. Must use the same level as the original session.'
      ),
    runMode: z
      .enum(['step', 'run_to_completion'])
      .optional()
      .describe(
        'Execution mode (default: "step"). "step" appends a single thought per call. "run_to_completion" consumes all supplied thought inputs in one request.'
      ),
    thought: z
      .string()
      .min(1)
      .max(100000)
      .describe(
        'Your full reasoning content for this step. ' +
          'The server stores this text verbatim as the thought in the session trace. ' +
          'Write your complete analysis, observations, and conclusions here — this is what appears in trace.md.'
      ),
    thoughts: z
      .array(z.string().min(1).max(100000))
      .max(25)
      .optional()
      .describe(
        'Optional additional thought inputs consumed in order when runMode is "run_to_completion".'
      ),
  })
  .superRefine((data, ctx) => {
    const runMode = data.runMode ?? 'step';

    if (data.sessionId === undefined && data.query === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'query is required when sessionId is not provided',
        path: ['query'],
      });
    }

    if (
      runMode === 'run_to_completion' &&
      data.sessionId === undefined &&
      data.targetThoughts === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'targetThoughts is required for run_to_completion when sessionId is not provided',
        path: ['targetThoughts'],
      });
    }

    if (runMode === 'step' && data.thoughts !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'thoughts is only allowed when runMode is "run_to_completion"',
        path: ['thoughts'],
      });
    }

    if (data.targetThoughts === undefined) {
      return;
    }

    const error = getTargetThoughtsError(data.level, data.targetThoughts);
    if (error) {
      ctx.addIssue({
        code: 'custom',
        message: error,
        path: ['targetThoughts'],
      });
    }
  });

export type ReasoningThinkInput = z.infer<typeof ReasoningThinkInputSchema>;
