import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatThoughtsToMarkdown } from '../lib/formatting.js';
import type { Session } from '../lib/types.js';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-session-id',
    level: 'basic',
    status: 'active',
    thoughts: [],
    totalThoughts: 3,
    tokenBudget: 2048,
    tokensUsed: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('formatThoughtsToMarkdown', () => {
  it('returns empty string for session with no thoughts', () => {
    const session = makeSession();
    const result = formatThoughtsToMarkdown(session);
    assert.equal(result, '');
  });

  it('produces full trace with header for session with thoughts', () => {
    const session = makeSession({
      thoughts: [
        { index: 0, content: 'First thought content', revision: 0 },
        { index: 1, content: 'Second thought content', revision: 0 },
      ],
    });
    const result = formatThoughtsToMarkdown(session);

    assert.ok(result.includes('# Reasoning Trace — [basic]'));
    assert.ok(result.includes('> Session [test-session-id]'));
    assert.ok(result.includes('[2] thoughts'));
    assert.ok(result.includes('𖦹 Thought [1]'));
    assert.ok(result.includes('First thought content'));
    assert.ok(result.includes('𖦹 Thought [2]'));
    assert.ok(result.includes('Second thought content'));
    assert.ok(result.includes('---'));
  });

  it('includes [Revised] suffix for revised thoughts', () => {
    const session = makeSession({
      thoughts: [{ index: 0, content: 'Revised content', revision: 2 }],
    });
    const result = formatThoughtsToMarkdown(session);
    assert.ok(result.includes('𖦹 Thought [1] [Revised]'));
  });

  it('extracts a range of thoughts without header', () => {
    const session = makeSession({
      thoughts: [
        { index: 0, content: 'First', revision: 0 },
        { index: 1, content: 'Second', revision: 0 },
        { index: 2, content: 'Third', revision: 0 },
      ],
    });
    const result = formatThoughtsToMarkdown(session, { start: 2, end: 2 });

    assert.ok(!result.includes('# Reasoning Trace'));
    assert.ok(result.includes('𖦹 Thought [2]'));
    assert.ok(result.includes('Second'));
    assert.ok(!result.includes('First'));
    assert.ok(!result.includes('Third'));
  });

  it('clamps range to valid bounds', () => {
    const session = makeSession({
      thoughts: [{ index: 0, content: 'Only thought', revision: 0 }],
    });
    const result = formatThoughtsToMarkdown(session, { start: 0, end: 100 });
    assert.ok(result.includes('𖦹 Thought [1]'));
    assert.ok(result.includes('Only thought'));
  });
});
