import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectPrefixMatches,
  getTargetThoughtsError,
  getThoughtBounds,
  parseBooleanEnv,
} from '../lib/validators.js';

describe('getThoughtBounds', () => {
  it('returns correct bounds for basic level', () => {
    const bounds = getThoughtBounds('basic');
    assert.equal(bounds.minThoughts, 1);
    assert.equal(bounds.maxThoughts, 3);
  });

  it('returns correct bounds for normal level', () => {
    const bounds = getThoughtBounds('normal');
    assert.equal(bounds.minThoughts, 4);
    assert.equal(bounds.maxThoughts, 8);
  });

  it('returns correct bounds for high level', () => {
    const bounds = getThoughtBounds('high');
    assert.equal(bounds.minThoughts, 10);
    assert.equal(bounds.maxThoughts, 15);
  });
});

describe('getTargetThoughtsError', () => {
  it('returns undefined for valid targetThoughts within basic range', () => {
    assert.equal(getTargetThoughtsError('basic', 1), undefined);
    assert.equal(getTargetThoughtsError('basic', 3), undefined);
  });

  it('returns undefined for valid targetThoughts within normal range', () => {
    assert.equal(getTargetThoughtsError('normal', 4), undefined);
    assert.equal(getTargetThoughtsError('normal', 8), undefined);
  });

  it('returns undefined for valid targetThoughts within high range', () => {
    assert.equal(getTargetThoughtsError('high', 10), undefined);
    assert.equal(getTargetThoughtsError('high', 15), undefined);
  });

  it('returns error for targetThoughts below minimum', () => {
    const error = getTargetThoughtsError('basic', 0);
    assert.ok(error);
    assert.ok(error.includes('between'));
    assert.ok(error.includes('1'));
    assert.ok(error.includes('3'));
  });

  it('returns error for targetThoughts above maximum', () => {
    const error = getTargetThoughtsError('high', 16);
    assert.ok(error);
    assert.ok(error.includes('between'));
    assert.ok(error.includes('10'));
    assert.ok(error.includes('15'));
  });

  it('returns error for non-integer targetThoughts', () => {
    const error = getTargetThoughtsError('basic', 3.5);
    assert.ok(error);
    assert.ok(error.includes('integer'));
  });
});

describe('collectPrefixMatches', () => {
  it('returns prefix matches in source order up to limit', () => {
    const matches = collectPrefixMatches(
      ['abc-1', 'abc-2', 'xyz-1', 'abc-3'],
      'abc',
      2
    );

    assert.deepEqual(matches, ['abc-1', 'abc-2']);
  });

  it('returns all matching values when under limit', () => {
    const matches = collectPrefixMatches(['id-a', 'id-b', 'x-a'], 'id', 10);

    assert.deepEqual(matches, ['id-a', 'id-b']);
  });

  it('returns empty list when no values match', () => {
    const matches = collectPrefixMatches(['id-a', 'id-b'], 'zzz', 5);

    assert.deepEqual(matches, []);
  });
});

describe('parseBooleanEnv', () => {
  it('returns fallback when env var is missing', () => {
    delete process.env.CORTEX_TEST_BOOL;
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', true), true);
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', false), false);
  });

  it('parses truthy literals', () => {
    process.env.CORTEX_TEST_BOOL = 'true';
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', false), true);

    process.env.CORTEX_TEST_BOOL = 'ON';
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', false), true);
  });

  it('parses falsy literals', () => {
    process.env.CORTEX_TEST_BOOL = 'false';
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', true), false);

    process.env.CORTEX_TEST_BOOL = '0';
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', true), false);
  });

  it('returns fallback for unrecognized values', () => {
    process.env.CORTEX_TEST_BOOL = 'sometimes';
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', true), true);
    assert.equal(parseBooleanEnv('CORTEX_TEST_BOOL', false), false);
    delete process.env.CORTEX_TEST_BOOL;
  });
});
