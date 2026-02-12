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
    });
    assert.equal(result.success, true);
  });

  it('accepts valid input with sessionId', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'Continue reasoning',
      level: 'high',
      targetThoughts: 20,
      sessionId: 'abc-123',
    });
    assert.equal(result.success, true);
  });

  it('rejects empty query', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: '',
      level: 'basic',
    });
    assert.equal(result.success, false);
  });

  it('rejects invalid level', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'invalid',
    });
    assert.equal(result.success, false);
  });

  it('rejects query that is too long', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'x'.repeat(10001),
      level: 'basic',
    });
    assert.equal(result.success, false);
  });

  it('rejects non-integer targetThoughts', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      targetThoughts: 3.5,
    });
    assert.equal(result.success, false);
  });

  it('rejects targetThoughts below basic level minimum', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      targetThoughts: 2,
    });
    assert.equal(result.success, false);
  });

  it('rejects targetThoughts above basic level maximum', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      targetThoughts: 6,
    });
    assert.equal(result.success, false);
  });

  it('accepts targetThoughts at basic level maximum', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      targetThoughts: 5,
    });
    assert.equal(result.success, true);
  });

  it('rejects unknown fields', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'basic',
      unknown: 'field',
    });
    assert.equal(result.success, false);
  });

  it('rejects targetThoughts above max (25)', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'high',
      targetThoughts: 26,
    });
    assert.equal(result.success, false);
  });

  it('accepts targetThoughts at max (25)', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      query: 'test',
      level: 'high',
      targetThoughts: 25,
    });
    assert.equal(result.success, true);
  });

  it('rejects missing query', () => {
    const result = ReasoningThinkInputSchema.safeParse({
      level: 'basic',
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
