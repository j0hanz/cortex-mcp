import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reason, sessionStore } from '../engine/reasoner.js';

describe('reason', () => {
  it('produces correct number of thoughts for basic level', async () => {
    const session = await reason('What is 2+2?', 'basic');
    assert.equal(session.thoughts.length, 5); // maxThoughts for basic
    sessionStore.delete(session.id);
  });

  it('produces correct number of thoughts for normal level', async () => {
    const session = await reason('Explain gravity', 'normal');
    assert.equal(session.thoughts.length, 10); // maxThoughts for normal
    sessionStore.delete(session.id);
  });

  it('produces correct number of thoughts for high level', async () => {
    const session = await reason('Solve world peace', 'high');
    assert.equal(session.thoughts.length, 25); // maxThoughts for high
    sessionStore.delete(session.id);
  });

  it('aborts when signal fires', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      () =>
        reason('test', 'basic', {
          abortSignal: controller.signal,
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

    assert.equal(progressCalls.length, 5);
    assert.deepEqual(progressCalls[0], { progress: 1, total: 5 });
    assert.deepEqual(progressCalls[4], { progress: 5, total: 5 });
    sessionStore.delete(session.id);
  });

  it('reuses existing session via sessionId', async () => {
    const first = await reason('Initial query', 'basic');
    const second = await reason('Follow-up', 'basic', {
      sessionId: first.id,
    });

    assert.equal(second.id, first.id);
    assert.equal(second.thoughts.length, 10); // 5 + 5
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
});
