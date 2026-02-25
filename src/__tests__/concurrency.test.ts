import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTaskLimiter } from '../lib/concurrency.js';

describe('createTaskLimiter', () => {
  it('allows acquisition up to the limit', () => {
    const limiter = createTaskLimiter(3);
    assert.ok(limiter.tryAcquire(), 'first acquire');
    assert.ok(limiter.tryAcquire(), 'second acquire');
    assert.ok(limiter.tryAcquire(), 'third acquire');
    assert.equal(limiter.tryAcquire(), false, 'fourth should fail');
  });

  it('returns false when at capacity', () => {
    const limiter = createTaskLimiter(1);
    assert.ok(limiter.tryAcquire());
    assert.equal(limiter.tryAcquire(), false);
  });

  it('release frees a slot allowing re-acquire', () => {
    const limiter = createTaskLimiter(1);
    assert.ok(limiter.tryAcquire());
    assert.equal(limiter.tryAcquire(), false);
    limiter.release();
    assert.ok(limiter.tryAcquire());
  });

  it('release when idle is a no-op (active stays at 0)', () => {
    const limiter = createTaskLimiter(1);
    limiter.release();
    assert.ok(limiter.tryAcquire());
  });

  it('limit of zero never allows acquisition', () => {
    const limiter = createTaskLimiter(0);
    assert.equal(limiter.tryAcquire(), false);
  });

  it('handles many sequential acquire-release cycles', () => {
    const limiter = createTaskLimiter(2);
    for (let i = 0; i < 10; i++) {
      assert.ok(limiter.tryAcquire(), `cycle ${i} acquire 1`);
      assert.ok(limiter.tryAcquire(), `cycle ${i} acquire 2`);
      assert.equal(limiter.tryAcquire(), false, `cycle ${i} at capacity`);
      limiter.release();
      limiter.release();
    }
  });
});
