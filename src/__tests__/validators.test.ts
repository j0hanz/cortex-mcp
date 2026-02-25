import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  collectPrefixMatches,
  getTargetThoughtsError,
  parseBooleanEnv,
  parsePositiveIntEnv,
} from '../lib/validators.js';

// ---------------------------------------------------------------------------
// getTargetThoughtsError
// ---------------------------------------------------------------------------

describe('getTargetThoughtsError', () => {
  it('returns undefined for valid basic target (min)', () => {
    assert.equal(getTargetThoughtsError('basic', 1), undefined);
  });

  it('returns undefined for valid basic target (max)', () => {
    assert.equal(getTargetThoughtsError('basic', 3), undefined);
  });

  it('returns undefined for valid normal target', () => {
    assert.equal(getTargetThoughtsError('normal', 4), undefined);
    assert.equal(getTargetThoughtsError('normal', 8), undefined);
  });

  it('returns undefined for valid high target', () => {
    assert.equal(getTargetThoughtsError('high', 10), undefined);
    assert.equal(getTargetThoughtsError('high', 15), undefined);
  });

  it('returns undefined for valid expert target', () => {
    assert.equal(getTargetThoughtsError('expert', 20), undefined);
    assert.equal(getTargetThoughtsError('expert', 25), undefined);
  });

  it('returns error string when below level minimum', () => {
    const err = getTargetThoughtsError('normal', 1);
    assert.ok(typeof err === 'string' && err.length > 0);
  });

  it('returns error string when above level maximum', () => {
    const err = getTargetThoughtsError('basic', 10);
    assert.ok(typeof err === 'string' && err.length > 0);
  });

  it('returns error string for non-integer (float)', () => {
    const err = getTargetThoughtsError('basic', 1.5);
    assert.ok(typeof err === 'string' && err.length > 0);
  });

  it('returns error string for expert out of range', () => {
    const err = getTargetThoughtsError('expert', 26);
    assert.ok(typeof err === 'string' && err.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parsePositiveIntEnv
// ---------------------------------------------------------------------------

describe('parsePositiveIntEnv', () => {
  const KEY = '__CORTEX_TEST_INT__';

  before(() => {
    delete process.env[KEY];
  });

  after(() => {
    delete process.env[KEY];
  });

  it('returns fallback when variable is absent', () => {
    assert.equal(parsePositiveIntEnv(KEY, 42), 42);
  });

  it('parses a valid integer string', () => {
    process.env[KEY] = '10';
    assert.equal(parsePositiveIntEnv(KEY, 42), 10);
  });

  it('returns fallback for non-numeric string', () => {
    process.env[KEY] = 'abc';
    assert.equal(parsePositiveIntEnv(KEY, 42), 42);
  });

  it('truncates float string to int via parseInt (3.14 -> 3, returns 3)', () => {
    process.env[KEY] = '3.14';
    assert.equal(parsePositiveIntEnv(KEY, 42), 3);
  });

  it('returns fallback for zero (below default minimum of 1)', () => {
    process.env[KEY] = '0';
    assert.equal(parsePositiveIntEnv(KEY, 42), 42);
  });

  it('returns fallback for value below custom minimum', () => {
    process.env[KEY] = '5';
    assert.equal(parsePositiveIntEnv(KEY, 99, 10), 99);
  });

  it('accepts value equal to custom minimum', () => {
    process.env[KEY] = '10';
    assert.equal(parsePositiveIntEnv(KEY, 99, 10), 10);
  });
});

// ---------------------------------------------------------------------------
// parseBooleanEnv
// ---------------------------------------------------------------------------

describe('parseBooleanEnv', () => {
  const KEY = '__CORTEX_TEST_BOOL__';

  before(() => {
    delete process.env[KEY];
  });

  after(() => {
    delete process.env[KEY];
  });

  it('returns true fallback when variable is absent', () => {
    assert.equal(parseBooleanEnv(KEY, true), true);
  });

  it('returns false fallback when variable is absent', () => {
    assert.equal(parseBooleanEnv(KEY, false), false);
  });

  const truthyValues = ['1', 'true', 'yes', 'on'];
  for (const val of truthyValues) {
    it(`returns true for "${val}"`, () => {
      process.env[KEY] = val;
      assert.equal(parseBooleanEnv(KEY, false), true);
    });
  }

  const falsyValues = ['0', 'false', 'no', 'off'];
  for (const val of falsyValues) {
    it(`returns false for "${val}"`, () => {
      process.env[KEY] = val;
      assert.equal(parseBooleanEnv(KEY, true), false);
    });
  }

  it('returns fallback for unrecognized value', () => {
    process.env[KEY] = 'maybe';
    assert.equal(parseBooleanEnv(KEY, true), true);
  });
});

// ---------------------------------------------------------------------------
// collectPrefixMatches
// ---------------------------------------------------------------------------

describe('collectPrefixMatches', () => {
  const candidates = ['basic', 'normal', 'high', 'expert'] as const;

  it('returns all candidates for empty prefix within limit', () => {
    const results = collectPrefixMatches(candidates, '', 10);
    assert.deepEqual(results, ['basic', 'normal', 'high', 'expert']);
  });

  it('returns matching candidates for single-char prefix', () => {
    assert.deepEqual(collectPrefixMatches(candidates, 'b', 10), ['basic']);
    assert.deepEqual(collectPrefixMatches(candidates, 'n', 10), ['normal']);
    assert.deepEqual(collectPrefixMatches(candidates, 'h', 10), ['high']);
  });

  it('returns empty array when no candidates match', () => {
    assert.deepEqual(collectPrefixMatches(candidates, 'xyz', 10), []);
  });

  it('respects the limit', () => {
    const results = collectPrefixMatches(candidates, '', 2);
    assert.equal(results.length, 2);
  });

  it('returns exact match', () => {
    assert.deepEqual(collectPrefixMatches(candidates, 'expert', 10), [
      'expert',
    ]);
  });

  it('limit=0 returns first match (check-after-push means min 1 or 0 results)', () => {
    // push happens before length check, so limit=0 yields at most 1 result per match
    const results = collectPrefixMatches(candidates, '', 0);
    assert.equal(results.length, 1);
  });
});
