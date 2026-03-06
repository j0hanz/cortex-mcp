import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ReasoningThinkInputSchema } from '../schemas/inputs.js';

// Helpers

function valid(input: unknown): void {
  const result = ReasoningThinkInputSchema.safeParse(input);
  assert.ok(
    result.success,
    `Expected valid input but got error: ${JSON.stringify(!result.success ? result.error.issues : [])}`
  );
}

function invalid(input: unknown): void {
  const result = ReasoningThinkInputSchema.safeParse(input);
  assert.ok(!result.success, `Expected invalid input but parsing succeeded`);
}

// ---------------------------------------------------------------------------
// New session (requires query + level)
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — valid new-session inputs', () => {
  it('minimal valid: query + level + thought', () => {
    valid({ query: 'What is 2+2?', level: 'basic', thought: 'Four.' });
  });

  it('query + level + structured fields (obs/hyp/eval)', () => {
    valid({
      query: 'Analyze this',
      level: 'normal',
      observation: 'data',
      hypothesis: 'theory',
      evaluation: 'result',
    });
  });

  it('accepts optional targetThoughts within range', () => {
    valid({
      query: 'Plan something',
      level: 'basic',
      thought: 'start',
      targetThoughts: 2,
    });
  });

  it('accepts optional isConclusion flag', () => {
    valid({
      query: 'q',
      level: 'basic',
      thought: 'done',
      isConclusion: true,
    });
  });

  it('accepts optional stepSummary', () => {
    valid({
      query: 'q',
      level: 'normal',
      thought: 'thought content',
      stepSummary: 'brief point',
    });
  });
});

// ---------------------------------------------------------------------------
// Continuation (requires sessionId — no query/level needed)
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — valid continuation inputs', () => {
  it('sessionId + thought is valid', () => {
    valid({ sessionId: 'abc-123', thought: 'next step' });
  });

  it('sessionId + rollbackToStep is valid', () => {
    valid({ sessionId: 'abc-123', rollbackToStep: 1 });
  });

  it('sessionId + structured fields is valid', () => {
    valid({
      sessionId: 'ses-99',
      observation: 'obs',
      hypothesis: 'hyp',
      evaluation: 'eval',
    });
  });
});

// ---------------------------------------------------------------------------
// run_to_completion mode
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — run_to_completion', () => {
  it('runMode=run_to_completion on continuation (sessionId) needs no targetThoughts', () => {
    valid({ sessionId: 'id', thought: 'cont', runMode: 'run_to_completion' });
  });

  it('runMode=run_to_completion on new session without targetThoughts passes schema', () => {
    valid({
      query: 'q',
      level: 'basic',
      thought: 't',
      runMode: 'run_to_completion',
    });
  });

  it('runMode=run_to_completion on new session with targetThoughts is valid', () => {
    valid({
      query: 'q',
      level: 'basic',
      thought: 't',
      runMode: 'run_to_completion',
      targetThoughts: 2,
    });
  });

  it('runMode=run_to_completion with normal level is rejected', () => {
    invalid({
      query: 'q',
      level: 'normal',
      thought: 't',
      runMode: 'run_to_completion',
    });
  });

  it('runMode=run_to_completion with high level is rejected', () => {
    invalid({
      query: 'q',
      level: 'high',
      thought: 't',
      runMode: 'run_to_completion',
    });
  });

  it('runMode=run_to_completion with expert level is rejected', () => {
    invalid({
      query: 'q',
      level: 'expert',
      thought: 't',
      runMode: 'run_to_completion',
    });
  });
});

// ---------------------------------------------------------------------------
// step mode — array thought disallowed
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — step mode', () => {
  it('runMode=step with string thought is valid', () => {
    valid({ sessionId: 'id', thought: 'single', runMode: 'step' });
  });

  it('runMode=step with array thought is invalid', () => {
    invalid({ sessionId: 'id', thought: ['a', 'b'], runMode: 'step' });
  });

  it('default (no runMode) with array thought is invalid', () => {
    invalid({ sessionId: 'id', thought: ['a', 'b'] });
  });
});

// ---------------------------------------------------------------------------
// batch mode — array thought allowed
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — batch thought array', () => {
  it('array of thoughts is valid for run_to_completion new session (basic)', () => {
    valid({
      query: 'q',
      level: 'basic',
      thought: ['t1', 't2'],
      runMode: 'run_to_completion',
      targetThoughts: 2,
    });
  });

  it('array of thoughts is rejected for run_to_completion with non-basic level', () => {
    invalid({
      query: 'q',
      level: 'normal',
      thought: ['t1', 't2'],
      runMode: 'run_to_completion',
      targetThoughts: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Missing required combinations
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — invalid missing fields', () => {
  it('missing both query and sessionId is invalid', () => {
    invalid({ level: 'basic', thought: 'something' });
  });

  it('missing both level and sessionId is invalid', () => {
    invalid({ query: 'q', thought: 'something' });
  });

  it('missing thought + structured + rollbackToStep is invalid', () => {
    invalid({ query: 'q', level: 'basic' });
  });

  it('empty object is invalid', () => {
    invalid({});
  });
});

// ---------------------------------------------------------------------------
// targetThoughts range validation
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — targetThoughts range', () => {
  it('basic level targetThoughts=0 is invalid (below min 1)', () => {
    invalid({ query: 'q', level: 'basic', thought: 't', targetThoughts: 0 });
  });

  it('basic level targetThoughts=4 passes schema (handler validates level range)', () => {
    valid({ query: 'q', level: 'basic', thought: 't', targetThoughts: 4 });
  });

  it('normal level targetThoughts=4 is valid', () => {
    valid({ query: 'q', level: 'normal', thought: 't', targetThoughts: 4 });
  });
});

// ---------------------------------------------------------------------------
// Unknown keys (strictObject rejects extra properties)
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — strictObject', () => {
  it('rejects unknown extra keys', () => {
    invalid({
      query: 'q',
      level: 'basic',
      thought: 't',
      unknownField: 'value',
    });
  });
});

// ---------------------------------------------------------------------------
// Level enum validation
// ---------------------------------------------------------------------------

describe('ReasoningThinkInputSchema — level enum', () => {
  it('rejects invalid level string', () => {
    invalid({ query: 'q', level: 'ultra', thought: 't' });
  });

  it('accepts all valid levels', () => {
    const levels = ['basic', 'normal', 'high', 'expert'] as const;
    for (const level of levels) {
      valid({ query: 'q', level, thought: 't' });
    }
  });
});
