import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ReasoningThinkInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  ReasoningThinkResultSchema,
  ReasoningThinkToolOutputSchema,
} from '../schemas/outputs.js';

describe('ReasoningThinkInputSchema', () => {
  it('accepts valid input', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'What is 2+2?',
      level: 'basic',
      thought: 'The answer is 4 because addition of two and two yields four.',
    });
    assert.equal(result.success, true);
  });

  it('accepts valid input with sessionId', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'Continue reasoning',
      level: 'high',
      targetThoughts: 20,
      sessionId: 'abc-123',
      thought: 'Continuing the analysis from the previous step.',
    });
    assert.equal(result.success, true);
  });

  it('accepts missing query when sessionId is provided', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      level: 'normal',
      sessionId: 'abc-123',
      thought: 'Continue reasoning without a new query.',
    });
    assert.equal(result.success, true);
  });

  it('rejects missing query for new sessions', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      level: 'basic',
      thought: 'New sessions must include a query.',
    });
    assert.equal(result.success, false);
  });

  it('rejects missing thought', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
    });
    assert.equal(result.success, false);
  });

  it('rejects empty query', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: '',
      level: 'basic',
      thought: 'Some thought.',
    });
    assert.equal(result.success, false);
  });

  it('rejects invalid level', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'invalid',
      thought: 'Some thought.',
    });
    assert.equal(result.success, false);
  });

  it('rejects query that is too long', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'x'.repeat(10001),
      level: 'basic',
      thought: 'Some thought.',
    });
    assert.equal(result.success, false);
  });

  it('rejects non-integer targetThoughts', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      thought: 'Some thought.',
      targetThoughts: 3.5,
    });
    assert.equal(result.success, false);
  });

  it('rejects targetThoughts below basic level minimum', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      thought: 'Some thought.',
      targetThoughts: 2,
    });
    assert.equal(result.success, false);
  });

  it('rejects targetThoughts above basic level maximum', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      thought: 'Some thought.',
      targetThoughts: 6,
    });
    assert.equal(result.success, false);
  });

  it('accepts targetThoughts at basic level maximum', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      thought: 'Some thought.',
      targetThoughts: 5,
    });
    assert.equal(result.success, true);
  });

  it('rejects unknown fields', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      thought: 'Some thought.',
      unknown: 'field',
    });
    assert.equal(result.success, false);
  });

  it('rejects targetThoughts above max (25)', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'high',
      thought: 'Some thought.',
      targetThoughts: 26,
    });
    assert.equal(result.success, false);
  });

  it('accepts targetThoughts at max (25)', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'high',
      thought: 'Some thought.',
      targetThoughts: 25,
    });
    assert.equal(result.success, true);
  });

  it('rejects empty thought', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      thought: '',
    });
    assert.equal(result.success, false);
  });

  it('accepts run_to_completion with additional thoughts', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      runMode: 'run_to_completion',
      targetThoughts: 3,
      thought: ['Step 1', 'Step 2', 'Step 3'],
    });
    assert.equal(result.success, true);
  });

  it('rejects run_to_completion without targetThoughts for new sessions', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      runMode: 'run_to_completion',
      thought: 'Step 1',
    });
    assert.equal(result.success, false);
  });

  it('accepts sessionId without level', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      sessionId: 'abc-123',
      thought: 'Continuing without level.',
    });
    assert.equal(result.success, true);
  });

  it('rejects missing level when sessionId is missing', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'New session',
      thought: 'Starting without level.',
    });
    assert.equal(result.success, false);
  });

  it('accepts run_to_completion without targetThoughts when sessionId is provided', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      sessionId: 'abc-123',
      runMode: 'run_to_completion',
      thought: 'Step 1',
    });
    assert.equal(result.success, true);
  });

  it('accepts array thought for run_to_completion', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      runMode: 'run_to_completion',
      targetThoughts: 3,
      thought: ['Step 1', 'Step 2', 'Step 3'],
    });
    assert.equal(result.success, true);
  });

  it('rejects array thought for step mode', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      runMode: 'step',
      thought: ['Step 1'],
    });
    assert.equal(result.success, false);
  });
});

describe('DefaultOutputSchema', () => {
  it('accepts valid success shape', () => {
    const result = DefaultOutputSchema.safeParse({
      ok: true,
      result: { data: 'test' },
    });
    assert.equal(result.success, true);
  });

  it('accepts valid error shape', () => {
    const result = DefaultOutputSchema.safeParse({
      ok: false,
      error: { code: 'E_TEST', message: 'Test error' },
    });
    assert.equal(result.success, true);
  });
});

describe('ReasoningThinkResultSchema', () => {
  it('accepts valid result', () => {
    const result = ReasoningThinkResultSchema.safeParse({
      ok: true,
      result: {
        sessionId: 'abc-123',
        level: 'basic',
        status: 'completed',
        thoughts: [{ index: 0, content: 'Step 1', revision: 0 }],
        generatedThoughts: 1,
        requestedThoughts: 1,
        totalThoughts: 1,
        remainingThoughts: 0,
        tokenBudget: 2048,
        tokensUsed: 6,
        ttlMs: 1800000,
        expiresAt: Date.now() + 1800000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        summary: 'Generated 1 thought(s) at basic depth.',
      },
    });
    assert.equal(result.success, true);
  });

  it('accepts valid error result', () => {
    const result = ReasoningThinkResultSchema.safeParse({
      ok: false,
      error: { code: 'E_TEST', message: 'failure' },
    });
    assert.equal(result.success, true);
  });

  it('rejects malformed result', () => {
    const result = ReasoningThinkResultSchema.safeParse({
      ok: true,
      result: {
        sessionId: 'abc-123',
        // missing required fields
      },
    });
    assert.equal(result.success, false);
  });

  it('rejects ok=false responses without error', () => {
    const result = ReasoningThinkResultSchema.safeParse({
      ok: false,
    });
    assert.equal(result.success, false);
  });
});

describe('ReasoningThinkToolOutputSchema', () => {
  it('describes tokenBudget as approximate', () => {
    const resultShape = ReasoningThinkToolOutputSchema.shape.result;
    const unwrapped = resultShape.unwrap();
    const desc = unwrapped.shape.tokenBudget.description;
    assert.ok(desc, 'tokenBudget should have a description');
    assert.ok(
      desc.includes('Approximate') || desc.includes('approximate'),
      `Expected description to mention approximation, got: ${desc}`
    );
  });

  it('describes tokensUsed as approximate', () => {
    const resultShape = ReasoningThinkToolOutputSchema.shape.result;
    const unwrapped = resultShape.unwrap();
    const desc = unwrapped.shape.tokensUsed.description;
    assert.ok(desc, 'tokensUsed should have a description');
    assert.ok(
      desc.includes('Approximate') || desc.includes('approximate'),
      `Expected description to mention approximation, got: ${desc}`
    );
  });
});
