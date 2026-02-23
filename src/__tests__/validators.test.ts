import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectPrefixMatches,
  getTargetThoughtsError,
  getThoughtBounds,
} from '../lib/validators.js';

describe('getThoughtBounds', () => {
  it('returns correct bounds for basic level', () => {
    const bounds = getThoughtBounds('basic');
    assert.equal(bounds.minThoughts, 3);
    assert.equal(bounds.maxThoughts, 5);
  });

  it('returns correct bounds for normal level', () => {
    const bounds = getThoughtBounds('normal');
    assert.equal(bounds.minThoughts, 6);
    assert.equal(bounds.maxThoughts, 10);
  });

  it('returns correct bounds for high level', () => {
    const bounds = getThoughtBounds('high');
    assert.equal(bounds.minThoughts, 15);
    assert.equal(bounds.maxThoughts, 25);
  });
});

describe('getTargetThoughtsError', () => {
  it('returns undefined for valid targetThoughts within basic range', () => {
    assert.equal(getTargetThoughtsError('basic', 3), undefined);
    assert.equal(getTargetThoughtsError('basic', 5), undefined);
  });

  it('returns undefined for valid targetThoughts within normal range', () => {
    assert.equal(getTargetThoughtsError('normal', 6), undefined);
    assert.equal(getTargetThoughtsError('normal', 10), undefined);
  });

  it('returns undefined for valid targetThoughts within high range', () => {
    assert.equal(getTargetThoughtsError('high', 15), undefined);
    assert.equal(getTargetThoughtsError('high', 25), undefined);
  });

  it('returns error for targetThoughts below minimum', () => {
    const error = getTargetThoughtsError('basic', 2);
    assert.ok(error);
    assert.ok(error.includes('between'));
    assert.ok(error.includes('3'));
    assert.ok(error.includes('5'));
  });

  it('returns error for targetThoughts above maximum', () => {
    const error = getTargetThoughtsError('high', 26);
    assert.ok(error);
    assert.ok(error.includes('between'));
    assert.ok(error.includes('15'));
    assert.ok(error.includes('25'));
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
