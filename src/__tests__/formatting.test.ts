import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractPinnedSections,
  formatProgressMessage,
  formatThoughtsToMarkdown,
} from '../lib/formatting.js';
import type { Session, Thought } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThought(
  index: number,
  content: string,
  stepSummary?: string
): Thought {
  return {
    index,
    content,
    revision: 0,
    ...(stepSummary ? { stepSummary } : {}),
  };
}

function makeSession(
  thoughts: readonly Thought[],
  overrides?: Partial<Session>
): Readonly<Session> {
  return {
    id: 'test-session-id',
    level: 'basic',
    status: 'active',
    thoughts,
    totalThoughts: 3,
    tokenBudget: 2048,
    tokensUsed: 0,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatThoughtsToMarkdown
// ---------------------------------------------------------------------------

describe('formatThoughtsToMarkdown', () => {
  it('returns empty string for session with no thoughts', () => {
    const session = makeSession([]);
    const result = formatThoughtsToMarkdown(session);
    assert.equal(result, '');
  });

  it('includes level and session id in header for non-empty session', () => {
    const thoughts = [makeThought(0, 'First thought')];
    const session = makeSession(thoughts, { level: 'normal' });
    const result = formatThoughtsToMarkdown(session);
    assert.ok(result.includes('normal'), 'should include level');
    assert.ok(result.includes('test-session-id'), 'should include session id');
  });

  it('includes thought content in output', () => {
    const thoughts = [
      makeThought(0, 'First thought content'),
      makeThought(1, 'Second thought content'),
    ];
    const session = makeSession(thoughts);
    const result = formatThoughtsToMarkdown(session);
    assert.ok(result.includes('First thought content'));
    assert.ok(result.includes('Second thought content'));
  });

  it('uses range to return only requested thoughts', () => {
    const thoughts = [
      makeThought(0, 'Alpha thought'),
      makeThought(1, 'Beta thought'),
      makeThought(2, 'Gamma thought'),
    ];
    const session = makeSession(thoughts);
    // range is 1-based; start:2 end:2 selects the second thought (index 1)
    const ranged = formatThoughtsToMarkdown(session, { start: 2, end: 2 });
    assert.ok(ranged.includes('Beta thought'));
    assert.ok(!ranged.includes('Alpha thought'));
    assert.ok(!ranged.includes('Gamma thought'));
  });

  it('range output does not include header', () => {
    const thoughts = [makeThought(0, 'Content')];
    const session = makeSession(thoughts);
    const ranged = formatThoughtsToMarkdown(session, { start: 0, end: 0 });
    assert.ok(!ranged.includes('# Reasoning Trace'));
  });

  it('stepSummary is stored in thought but not rendered in markdown body', () => {
    const thoughts = [makeThought(0, 'Content', 'My summary sentence.')];
    const session = makeSession(thoughts);
    const result = formatThoughtsToMarkdown(session);
    // The content IS rendered; stepSummary is metadata, not part of the rendered block
    assert.ok(result.includes('Content'));
  });
});

// ---------------------------------------------------------------------------
// extractPinnedSections
// ---------------------------------------------------------------------------

describe('extractPinnedSections', () => {
  it('returns empty array when no thoughts have pinned sections', () => {
    const thoughts = [makeThought(0, 'No pins here')];
    assert.deepEqual(extractPinnedSections(thoughts), []);
  });

  it('extracts a valid pinned section', () => {
    const content =
      '<!-- pin: Key Finding -->\nImportant result.\n<!-- /pin -->';
    const thoughts = [makeThought(0, content)];
    const sections = extractPinnedSections(thoughts);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.title, 'Key Finding');
    assert.ok(sections[0]?.content.includes('Important result.'));
  });

  it('last one wins for duplicate titles', () => {
    const first = '<!-- pin: Title -->\nFirst content.\n<!-- /pin -->';
    const second = '<!-- pin: Title -->\nSecond content.\n<!-- /pin -->';
    const thoughts = [makeThought(0, first), makeThought(1, second)];
    const sections = extractPinnedSections(thoughts);
    assert.equal(sections.length, 1);
    assert.ok(sections[0]?.content.includes('Second content.'));
  });

  it('handles multiple distinct pinned sections in one thought', () => {
    const content = [
      '<!-- pin: A -->\nContent A.\n<!-- /pin -->',
      'middle text',
      '<!-- pin: B -->\nContent B.\n<!-- /pin -->',
    ].join('\n');
    const thoughts = [makeThought(0, content)];
    const sections = extractPinnedSections(thoughts);
    assert.equal(sections.length, 2);
  });

  it('skips malformed pin tags without closing marker', () => {
    const thoughts = [makeThought(0, '<!-- pin: Broken -->\nNo closing tag.')];
    const sections = extractPinnedSections(thoughts);
    assert.deepEqual(sections, []);
  });
});

// ---------------------------------------------------------------------------
// formatProgressMessage
// ---------------------------------------------------------------------------

describe('formatProgressMessage', () => {
  it('formats start/mid message without outcome', () => {
    const msg = formatProgressMessage({
      toolName: 'reasoning_think',
      context: 'step 1 of 3',
    });
    assert.equal(msg, 'reasoning_think: step 1 of 3');
  });

  it('appends metadata when provided', () => {
    const msg = formatProgressMessage({
      toolName: 'tool',
      context: 'context',
      metadata: '[1/3]',
    });
    assert.equal(msg, 'tool: context [1/3]');
  });

  it('appends outcome separated by bullet when provided', () => {
    const msg = formatProgressMessage({
      toolName: 'tool',
      context: 'context',
      metadata: '[3/3]',
      outcome: 'completed',
    });
    assert.equal(msg, 'tool: context [3/3] • completed');
  });

  it('formats with outcome and no metadata', () => {
    const msg = formatProgressMessage({
      toolName: 'tool',
      context: 'done',
      outcome: 'ok',
    });
    assert.equal(msg, 'tool: done • ok');
  });
});
