import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ReasoningThinkToolOutputSchema } from '../schemas/outputs.js';

function valid(payload: unknown): void {
  const result = ReasoningThinkToolOutputSchema.safeParse(payload);
  assert.ok(
    result.success,
    `Expected valid output but got: ${JSON.stringify(!result.success ? result.error.issues : [])}`
  );
}

function invalid(payload: unknown): void {
  const result = ReasoningThinkToolOutputSchema.safeParse(payload);
  assert.equal(result.success, false);
}

describe('ReasoningThinkToolOutputSchema', () => {
  it('accepts ok=true shape with result', () => {
    valid({
      ok: true,
      result: {
        sessionId: 's1',
        level: 'basic',
        status: 'active',
        thoughts: [],
        generatedThoughts: 1,
        requestedThoughts: 1,
        totalThoughts: 1,
        tokenBudget: 2048,
        tokensUsed: 128,
        ttlMs: 1000,
        expiresAt: 2,
        createdAt: 1,
        updatedAt: 1,
        remainingThoughts: 0,
        summary: 'ok',
      },
    });
  });

  it('accepts ok=false shape with error', () => {
    valid({
      ok: false,
      error: {
        code: 'E_TEST',
        message: 'bad',
      },
    });
  });

  it('rejects ok=true payload without result', () => {
    invalid({
      ok: true,
      error: {
        code: 'E_TEST',
        message: 'bad',
      },
    });
  });

  it('rejects ok=false payload without error', () => {
    invalid({
      ok: false,
      result: {
        sessionId: 's1',
      },
    });
  });

  it('rejects payload that contains both result and error', () => {
    invalid({
      ok: true,
      result: {
        sessionId: 's1',
        level: 'basic',
        status: 'active',
        thoughts: [],
        generatedThoughts: 1,
        requestedThoughts: 1,
        totalThoughts: 1,
        tokenBudget: 2048,
        tokensUsed: 128,
        ttlMs: 1000,
        expiresAt: 2,
        createdAt: 1,
        updatedAt: 1,
        remainingThoughts: 0,
        summary: 'ok',
      },
      error: {
        code: 'E_TEST',
        message: 'bad',
      },
    });
  });
});
