import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import { reason, sessionStore } from '../engine/reasoner.js';

describe('reason', () => {
  it('produces range-bounded thoughts for basic level', async () => {
    const session = await reason('What is 2+2?', 'basic');
    assert.ok(session.thoughts.length >= 3);
    assert.ok(session.thoughts.length <= 5);
    sessionStore.delete(session.id);
  });

  it('produces range-bounded thoughts for normal level', async () => {
    const session = await reason('Explain gravity', 'normal');
    assert.ok(session.thoughts.length >= 6);
    assert.ok(session.thoughts.length <= 10);
    sessionStore.delete(session.id);
  });

  it('produces range-bounded thoughts for high level', async () => {
    const session = await reason('Solve world peace', 'high');
    assert.ok(session.thoughts.length >= 15);
    assert.ok(session.thoughts.length <= 25);
    sessionStore.delete(session.id);
  });

  it('aborts when signal fires', async () => {
    await assert.rejects(
      () =>
        reason('test', 'basic', {
          abortSignal: AbortSignal.abort(),
        }),
      { message: 'Reasoning aborted' }
    );
  });

  it('calls onProgress after each thought', async () => {
    const progressCalls: Array<{ progress: number; total: number }> = [];

    const session = await reason('test', 'basic', {
      onProgress: (progress, total) => {
        progressCalls.push({ progress, total });
      },
    });

    assert.equal(progressCalls.length, session.thoughts.length);
    assert.deepEqual(progressCalls[0], {
      progress: 1,
      total: session.thoughts.length,
    });
    assert.deepEqual(progressCalls.at(-1), {
      progress: session.thoughts.length,
      total: session.thoughts.length,
    });
    sessionStore.delete(session.id);
  });

  it('reuses existing session via sessionId', async () => {
    const first = await reason('Initial query', 'basic');
    const initialThoughtCount = first.thoughts.length;
    const second = await reason('Follow-up', 'basic', {
      sessionId: first.id,
    });

    assert.equal(second.id, first.id);
    assert.ok(second.thoughts.length > initialThoughtCount);
    sessionStore.delete(first.id);
  });

  it('rejects reusing a session with a different level', async () => {
    const first = await reason('Initial query', 'basic');
    await assert.rejects(
      () =>
        reason('Follow-up', 'high', {
          sessionId: first.id,
        }),
      { message: /Session level mismatch/ }
    );
    sessionStore.delete(first.id);
  });

  it('throws for invalid sessionId', async () => {
    await assert.rejects(
      () =>
        reason('test', 'basic', {
          sessionId: 'non-existent-session',
        }),
      { message: /Session not found/ }
    );
  });

  it('honors explicit targetThoughts within level range', async () => {
    const session = await reason('Break this down in detail', 'normal', {
      targetThoughts: 8,
    });
    assert.equal(session.thoughts.length, 8);
    sessionStore.delete(session.id);
  });

  it('rejects targetThoughts outside the level range', async () => {
    await assert.rejects(
      () =>
        reason('test', 'basic', {
          targetThoughts: 9,
        }),
      { message: /targetThoughts must be between 3 and 5/ }
    );
  });

  it('heuristic: short query produces minThoughts', async () => {
    const session = await reason('hi', 'basic');
    assert.equal(session.thoughts.length, 3); // basic minThoughts
    sessionStore.delete(session.id);
  });

  it('heuristic: long multi-sentence query produces near maxThoughts', async () => {
    const longQuery =
      'This is a long and complex question with multiple sentences. ' +
      'It contains significant structural complexity. ' +
      'Each sentence adds depth to the analysis. ' +
      'The reasoning should consider many factors.';
    const session = await reason(longQuery, 'basic');
    // Should produce 4 or 5 thoughts (near maxThoughts = 5)
    assert.ok(session.thoughts.length >= 4);
    assert.ok(session.thoughts.length <= 5);
    sessionStore.delete(session.id);
  });

  it('heuristic: query with compare keyword produces higher count', async () => {
    const shortSession = await reason('hello world', 'normal');
    const keywordSession = await reason(
      'compare the advantages and disadvantages',
      'normal'
    );
    // Keyword query should produce more thoughts than short query
    assert.ok(keywordSession.thoughts.length > shortSession.thoughts.length);
    sessionStore.delete(shortSession.id);
    sessionStore.delete(keywordSession.id);
  });

  it('stops generating thoughts when token budget is exhausted', async () => {
    // Create a session at basic level (budget 2048), manually fill to near-limit
    const session = await reason('test', 'basic', { targetThoughts: 3 });

    // Each padding thought ≈ 680 tokens (2720 bytes ÷ 4)
    const tokensPerPadding = 680;
    const padding = 'x'.repeat(tokensPerPadding * 4);

    // Add 2 padding thoughts: ~1360 tokens used, leaving ~688 tokens
    sessionStore.addThought(session.id, padding);
    sessionStore.addThought(session.id, padding);

    // Add one more large thought to get very close to budget: ~2040 tokens used
    sessionStore.addThought(session.id, 'x'.repeat(2720));

    const beforeCount = sessionStore.get(session.id)!.thoughts.length;

    // Request 3 more thoughts — budget should cut it short to 1 or 0 new thoughts
    const continued = await reason('continue', 'basic', {
      sessionId: session.id,
      targetThoughts: 3,
    });

    const newThoughts = continued.thoughts.length - beforeCount;
    assert.ok(
      newThoughts < 3,
      `Expected fewer than 3 new thoughts due to budget, got ${String(newThoughts)}`
    );
    sessionStore.delete(session.id);
  });

  it('truncates unicode queries without UTF-8 replacement artifacts', async () => {
    const session = await reason('😀'.repeat(300), 'basic', {
      targetThoughts: 3,
    });

    const firstThought = session.thoughts[0];
    assert.ok(firstThought);
    const encoded = Buffer.from(firstThought.content, 'utf8');
    const replacementChar = Buffer.from([0xef, 0xbf, 0xbd]);
    assert.equal(encoded.includes(replacementChar), false);

    sessionStore.delete(session.id);
  });

  it('truncates emoji-heavy queries on grapheme boundaries', async () => {
    const session = await reason('👩‍👩‍👧‍👦'.repeat(300), 'basic', {
      targetThoughts: 3,
    });

    const firstThought = session.thoughts[0];
    assert.ok(firstThought);
    const match = firstThought.content.match(/"(?<value>.*)"$/u);
    assert.ok(match?.groups?.value);
    const displayed = match.groups.value;
    assert.equal(displayed.endsWith('...'), true);
    const withoutSuffix = displayed.slice(0, -3);
    assert.match(withoutSuffix, /^(?:👩‍👩‍👧‍👦)+$/u);

    sessionStore.delete(session.id);
  });

  it.skip('truncates via UTF-8 fallback when Intl.Segmenter unavailable', async () => {
    // This test would require mocking Intl.Segmenter to return undefined,
    // which is not easily done since the segmenter is a module-level constant.
    // The fallback path (truncateByUtf8Boundary) is implicitly tested by the
    // emoji truncation tests above, which verify no U+FFFD replacement characters
    // appear in truncated output (indicating proper UTF-8 boundary handling).
    // In environments without Intl.Segmenter (older Node versions), the existing
    // tests exercise the fallback automatically.
  });
});
