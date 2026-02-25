import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  DEFAULT_MAX_SESSIONS,
  DEFAULT_MAX_TOTAL_TOKENS,
  DEFAULT_SESSION_TTL_MS,
  SessionStore,
} from '../engine/session-store.js';

import { SessionNotFoundError } from '../lib/errors.js';

function makeStore(
  opts: { ttl?: number; maxSessions?: number; maxTokens?: number } = {}
): SessionStore {
  return new SessionStore(
    opts.ttl ?? DEFAULT_SESSION_TTL_MS,
    opts.maxSessions ?? DEFAULT_MAX_SESSIONS,
    opts.maxTokens ?? DEFAULT_MAX_TOTAL_TOKENS
  );
}

// ---------------------------------------------------------------------------
// Constructor / defaults
// ---------------------------------------------------------------------------

describe('SessionStore — defaults', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('exports sensible default constants', () => {
    assert.ok(DEFAULT_SESSION_TTL_MS > 0);
    assert.ok(DEFAULT_MAX_SESSIONS > 0);
    assert.ok(DEFAULT_MAX_TOTAL_TOKENS > 0);
  });

  it('getTtlMs returns the configured TTL', () => {
    const store2 = new SessionStore(5000);
    after(() => {
      store2.dispose();
    });
    assert.equal(store2.getTtlMs(), 5000);
  });

  it('starts with zero sessions and zero tokens', () => {
    assert.equal(store.list().length, 0);
    assert.equal(store.listSummaries().length, 0);
    assert.equal(store.getTotalTokensUsed(), 0);
  });
});

// ---------------------------------------------------------------------------
// CRUD — create / get / list / delete
// ---------------------------------------------------------------------------

describe('SessionStore — CRUD', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('create returns a valid immutable session snapshot', () => {
    const s = store.create('basic', 2, 'test query');
    assert.ok(typeof s.id === 'string');
    assert.equal(s.level, 'basic');
    assert.equal(s.status, 'active');
    assert.equal(s.thoughts.length, 0);
    assert.equal(s.totalThoughts, 2);
    assert.equal(s.query, 'test query');
  });

  it('get returns the created session', () => {
    const s = store.create('normal');
    const retrieved = store.get(s.id);
    assert.ok(retrieved !== undefined);
    assert.equal(retrieved.id, s.id);
  });

  it('get returns undefined for unknown id', () => {
    assert.equal(store.get('00000000-fake-fake-fake-000000000000'), undefined);
  });

  it('list includes all created sessions', () => {
    const s1 = store.create('basic');
    const s2 = store.create('normal');
    const all = store.list();
    const ids = all.map((s) => s.id);
    assert.ok(ids.includes(s1.id));
    assert.ok(ids.includes(s2.id));
  });

  it('listSessionIds returns known ids', () => {
    const s = store.create('high');
    const ids = store.listSessionIds();
    assert.ok(ids.includes(s.id));
  });

  it('delete removes the session and returns true', () => {
    const s = store.create('basic');
    const result = store.delete(s.id);
    assert.equal(result, true);
    assert.equal(store.get(s.id), undefined);
  });

  it('delete returns false for unknown id', () => {
    assert.equal(store.delete('00000000-0000-0000-0000-000000000000'), false);
  });
});

// ---------------------------------------------------------------------------
// addThought
// ---------------------------------------------------------------------------

describe('SessionStore — addThought', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('addThought appends to session and returns a snapshot', () => {
    const s = store.create('basic');
    const t = store.addThought(s.id, 'first thought');
    assert.equal(t.index, 0);
    assert.equal(t.content, 'first thought');
    assert.equal(t.revision, 0);
    const updated = store.get(s.id);
    assert.equal(updated?.thoughts.length, 1);
  });

  it('addThought increments tokensUsed', () => {
    const s = store.create('basic');
    store.addThought(s.id, 'content that uses tokens');
    const updated = store.get(s.id);
    assert.ok((updated?.tokensUsed ?? 0) > 0);
  });

  it('addThought stores stepSummary when provided', () => {
    const s = store.create('basic');
    const t = store.addThought(s.id, 'thought with summary', 'key point');
    assert.equal(t.stepSummary, 'key point');
  });

  it('multiple thoughts have consecutive indices', () => {
    const s = store.create('normal');
    store.addThought(s.id, 'one');
    store.addThought(s.id, 'two');
    store.addThought(s.id, 'three');
    const updated = store.get(s.id);
    const indices = updated?.thoughts.map((t) => t.index) ?? [];
    assert.deepEqual(indices, [0, 1, 2]);
  });

  it('throws SessionNotFoundError for unknown session', () => {
    assert.throws(
      () => store.addThought('no-such-id', 'content'),
      (err: unknown) => err instanceof SessionNotFoundError
    );
  });
});

// ---------------------------------------------------------------------------
// rollback
// ---------------------------------------------------------------------------

describe('SessionStore — rollback', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('rollback keeps thoughts up to and including toIndex', () => {
    const s = store.create('normal');
    store.addThought(s.id, 'T0');
    store.addThought(s.id, 'T1');
    store.addThought(s.id, 'T2');
    store.rollback(s.id, 0);
    const updated = store.get(s.id);
    assert.equal(updated?.thoughts.length, 1);
    assert.equal(updated?.thoughts[0]?.content, 'T0');
  });

  it('rollback to last valid index is a no-op', () => {
    const s = store.create('basic');
    store.addThought(s.id, 'only');
    store.rollback(s.id, 0); // index == length-1, nothing removed
    const updated = store.get(s.id);
    assert.equal(updated?.thoughts.length, 1);
  });

  it('rollback reduces tokensUsed', () => {
    const s = store.create('normal');
    store.addThought(s.id, 'keep this one');
    store.addThought(s.id, 'a'.repeat(500));
    const before = store.get(s.id)?.tokensUsed ?? 0;
    store.rollback(s.id, 0);
    const after = store.get(s.id)?.tokensUsed ?? 0;
    assert.ok(after < before);
  });
});

// ---------------------------------------------------------------------------
// reviseThought
// ---------------------------------------------------------------------------

describe('SessionStore — reviseThought', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('reviseThought bumps revision counter', () => {
    const s = store.create('basic');
    store.addThought(s.id, 'original');
    store.reviseThought(s.id, 0, 'revised content');
    const updated = store.get(s.id);
    assert.equal(updated?.thoughts[0]?.revision, 1);
    assert.equal(updated?.thoughts[0]?.content, 'revised content');
  });

  it('reviseThought throws for unknown thought index', () => {
    const s = store.create('basic');
    assert.throws(() => store.reviseThought(s.id, 99, 'nope'));
  });
});

// ---------------------------------------------------------------------------
// markCompleted / markCancelled
// ---------------------------------------------------------------------------

describe('SessionStore — status transitions', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('markCompleted sets status to completed', () => {
    const s = store.create('basic');
    store.markCompleted(s.id);
    assert.equal(store.get(s.id)?.status, 'completed');
  });

  it('markCancelled sets status to cancelled', () => {
    const s = store.create('basic');
    store.markCancelled(s.id);
    assert.equal(store.get(s.id)?.status, 'cancelled');
  });
});

// ---------------------------------------------------------------------------
// Capacity eviction
// ---------------------------------------------------------------------------

describe('SessionStore — capacity eviction', () => {
  it('evicts oldest session when maxSessions is exceeded', () => {
    const store = makeStore({ ttl: 999_999, maxSessions: 2 });
    after(() => {
      store.dispose();
    });

    const s1 = store.create('basic');
    const s2 = store.create('basic');
    // Creating a third should evict s1
    store.create('basic');

    assert.equal(
      store.get(s1.id),
      undefined,
      'oldest session should be evicted'
    );
    assert.ok(store.get(s2.id) !== undefined, 'second session should remain');
  });
});

// ---------------------------------------------------------------------------
// Snapshot immutability
// ---------------------------------------------------------------------------

describe('SessionStore — snapshot immutability', () => {
  const store = makeStore();
  after(() => {
    store.dispose();
  });

  it('returned session snapshot is not the live object', () => {
    const s = store.create('basic');
    store.addThought(s.id, 'new thought');
    // The original snapshot should still show 0 thoughts
    assert.equal(s.thoughts.length, 0, 'original snapshot must not mutate');
  });

  it('listSummaries returns summary objects', () => {
    const s = store.create('basic', 3, 'my query');
    const summaries = store.listSummaries();
    const summary = summaries.find((sm) => sm.id === s.id);
    assert.ok(summary !== undefined);
    assert.ok('id' in summary);
  });
});

// ---------------------------------------------------------------------------
// getExpiresAt
// ---------------------------------------------------------------------------

describe('SessionStore — getExpiresAt', () => {
  const store = makeStore({ ttl: 60_000 });
  after(() => {
    store.dispose();
  });

  it('returns a future timestamp for a live session', () => {
    const s = store.create('basic');
    const expires = store.getExpiresAt(s.id);
    assert.ok(expires !== undefined);
    assert.ok(expires > Date.now());
  });

  it('returns undefined for unknown session', () => {
    assert.equal(store.getExpiresAt('no-such'), undefined);
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('SessionStore — dispose', () => {
  it('dispose can be called multiple times without error', () => {
    const store = makeStore();
    store.dispose();
    assert.doesNotThrow(() => {
      store.dispose();
    });
  });
});
