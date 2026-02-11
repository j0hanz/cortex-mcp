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
});
