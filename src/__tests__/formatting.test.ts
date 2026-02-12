import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractPinnedSections,
  formatThoughtsToMarkdown,
} from '../lib/formatting.js';
import type { Session, Thought } from '../lib/types.js';

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

function makeThought(index: number, content: string, revision = 0): Thought {
  return { index, content, revision };
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
        makeThought(0, 'First thought content'),
        makeThought(1, 'Second thought content'),
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
      thoughts: [makeThought(0, 'Revised content', 2)],
    });
    const result = formatThoughtsToMarkdown(session);
    assert.ok(result.includes('𖦹 Thought [1] [Revised]'));
  });

  it('extracts a range of thoughts without header', () => {
    const session = makeSession({
      thoughts: [
        makeThought(0, 'First'),
        makeThought(1, 'Second'),
        makeThought(2, 'Third'),
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
      thoughts: [makeThought(0, 'Only thought')],
    });
    const result = formatThoughtsToMarkdown(session, { start: 0, end: 100 });
    assert.ok(result.includes('𖦹 Thought [1]'));
    assert.ok(result.includes('Only thought'));
  });

  it('includes pinned sections in full trace when present', () => {
    const session = makeSession({
      thoughts: [
        makeThought(
          0,
          'Some analysis.\n<!-- pin: Key Decision -->\nWe chose REST.\n<!-- /pin -->'
        ),
        makeThought(1, 'More analysis.'),
      ],
    });
    const result = formatThoughtsToMarkdown(session);

    assert.ok(result.includes('## 📌 Pinned'));
    assert.ok(result.includes('### Key Decision *(Thought 1)*'));
    assert.ok(result.includes('We chose REST.'));
  });

  it('does not include pinned sections for range queries', () => {
    const session = makeSession({
      thoughts: [
        makeThought(
          0,
          '<!-- pin: Note -->\nImportant\n<!-- /pin -->\nSome content'
        ),
      ],
    });
    const result = formatThoughtsToMarkdown(session, { start: 1, end: 1 });

    assert.ok(!result.includes('## 📌 Pinned'));
    // Raw content is still there in the thought
    assert.ok(result.includes('<!-- pin: Note -->'));
  });
});

// ---------------------------------------------------------------------------
// extractPinnedSections
// ---------------------------------------------------------------------------

describe('extractPinnedSections', () => {
  it('returns empty array when no pins', () => {
    const thoughts = [makeThought(0, 'No pins.')];
    assert.deepStrictEqual(extractPinnedSections(thoughts), []);
  });

  it('extracts a single pinned section', () => {
    const thoughts = [
      makeThought(0, '<!-- pin: Architecture -->\nWe use REST.\n<!-- /pin -->'),
    ];
    const pins = extractPinnedSections(thoughts);
    assert.equal(pins.length, 1);
    assert.equal(pins[0]!.title, 'Architecture');
    assert.equal(pins[0]!.content, 'We use REST.');
    assert.equal(pins[0]!.thoughtIndex, 0);
  });

  it('last-write-wins for duplicate titles across thoughts', () => {
    const thoughts = [
      makeThought(0, '<!-- pin: Decision -->\nOption A\n<!-- /pin -->'),
      makeThought(
        1,
        '<!-- pin: Decision -->\nOption B (revised)\n<!-- /pin -->'
      ),
    ];
    const pins = extractPinnedSections(thoughts);
    assert.equal(pins.length, 1);
    assert.equal(pins[0]!.content, 'Option B (revised)');
    assert.equal(pins[0]!.thoughtIndex, 1);
  });

  it('ignores unclosed pin markers', () => {
    const thoughts = [
      makeThought(0, '<!-- pin: Orphan -->\nContent without closing'),
    ];
    const pins = extractPinnedSections(thoughts);
    assert.equal(pins.length, 0);
  });

  it('extracts multiple distinct pins', () => {
    const thoughts = [
      makeThought(
        0,
        '<!-- pin: A -->\nAlpha\n<!-- /pin -->\n<!-- pin: B -->\nBeta\n<!-- /pin -->'
      ),
    ];
    const pins = extractPinnedSections(thoughts);
    assert.equal(pins.length, 2);
    assert.equal(pins[0]!.title, 'A');
    assert.equal(pins[1]!.title, 'B');
  });

  it('allows empty content in pins', () => {
    const thoughts = [makeThought(0, '<!-- pin: Marker --><!-- /pin -->')];
    const pins = extractPinnedSections(thoughts);
    assert.equal(pins.length, 1);
    assert.equal(pins[0]!.content, '');
  });
});
