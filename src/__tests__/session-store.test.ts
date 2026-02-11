import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SessionStore } from '../engine/session-store.js';

describe('SessionStore', () => {
  describe('create', () => {
    it('returns session with valid UUID', () => {
      const store = new SessionStore();
      const session = store.create('basic');
      assert.match(
        session.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('sets correct level', () => {
      const store = new SessionStore();
      const session = store.create('normal');
      assert.equal(session.level, 'normal');
    });

    it('initialises with empty thoughts', () => {
      const store = new SessionStore();
      const session = store.create('basic');
      assert.equal(session.thoughts.length, 0);
    });

    it('sets correct token budget from config', () => {
      const store = new SessionStore();

      const basic = store.create('basic');
      assert.equal(basic.tokenBudget, 2048);

      const normal = store.create('normal');
      assert.equal(normal.tokenBudget, 8192);

      const high = store.create('high');
      assert.equal(high.tokenBudget, 32768);
    });
  });

  describe('get', () => {
    it('retrieves existing session', () => {
      const store = new SessionStore();
      const session = store.create('basic');
      const retrieved = store.get(session.id);
      assert.deepEqual(retrieved, session);
    });

    it('returns undefined for non-existent session', () => {
      const store = new SessionStore();
      assert.equal(store.get('non-existent'), undefined);
    });
  });

  describe('delete', () => {
    it('removes session', () => {
      const store = new SessionStore();
      const session = store.create('basic');
      assert.equal(store.delete(session.id), true);
      assert.equal(store.get(session.id), undefined);
    });

    it('returns false for non-existent session', () => {
      const store = new SessionStore();
      assert.equal(store.delete('non-existent'), false);
    });
  });

  describe('addThought', () => {
    it('appends thought with correct index', () => {
      const store = new SessionStore();
      const session = store.create('basic');

      const t0 = store.addThought(session.id, 'First thought');
      assert.equal(t0.index, 0);
      assert.equal(t0.content, 'First thought');
      assert.equal(t0.revision, 0);

      const t1 = store.addThought(session.id, 'Second thought');
      assert.equal(t1.index, 1);
    });

    it('increases tokensUsed', () => {
      const store = new SessionStore();
      const session = store.create('basic');

      store.addThought(session.id, 'Hello');
      const updated = store.get(session.id)!;
      assert.equal(updated.tokensUsed, 5);
    });

    it('throws for non-existent session', () => {
      const store = new SessionStore();
      assert.throws(() => store.addThought('non-existent', 'content'));
    });
  });

  describe('reviseThought', () => {
    it('replaces content and increments revision', () => {
      const store = new SessionStore();
      const session = store.create('basic');

      store.addThought(session.id, 'Original');
      const revised = store.reviseThought(session.id, 0, 'Revised');

      assert.equal(revised.index, 0);
      assert.equal(revised.content, 'Revised');
      assert.equal(revised.revision, 1);
    });

    it('updates tokensUsed correctly', () => {
      const store = new SessionStore();
      const session = store.create('basic');

      store.addThought(session.id, 'Hello'); // 5 chars
      store.reviseThought(session.id, 0, 'Hi'); // 2 chars

      const updated = store.get(session.id)!;
      assert.equal(updated.tokensUsed, 2);
    });

    it('throws for non-existent thought index', () => {
      const store = new SessionStore();
      const session = store.create('basic');
      assert.throws(() => store.reviseThought(session.id, 99, 'content'));
    });
  });
});
