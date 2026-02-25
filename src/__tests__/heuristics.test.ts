import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getLevelConfig } from '../engine/config.js';
import {
  countSentences,
  getStructureDensityScore,
  resolveThoughtCount,
} from '../engine/heuristics.js';

import { InvalidThoughtCountError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// resolveThoughtCount
// ---------------------------------------------------------------------------

describe('resolveThoughtCount — explicit targetThoughts', () => {
  it('returns the exact targetThoughts when it is within range', () => {
    const config = getLevelConfig('basic');
    assert.equal(resolveThoughtCount('basic', 'any query', config, 2), 2);
  });

  it('returns min for basic level with targetThoughts=1', () => {
    const config = getLevelConfig('basic');
    assert.equal(resolveThoughtCount('basic', 'q', config, 1), 1);
  });

  it('returns max for basic level with targetThoughts=3', () => {
    const config = getLevelConfig('basic');
    assert.equal(resolveThoughtCount('basic', 'q', config, 3), 3);
  });

  it('throws InvalidThoughtCountError for out-of-range targetThoughts', () => {
    const config = getLevelConfig('basic');
    assert.throws(
      () => resolveThoughtCount('basic', 'q', config, 10),
      (err: unknown) => err instanceof InvalidThoughtCountError
    );
  });

  it('throws for below-min targetThoughts on normal level', () => {
    const config = getLevelConfig('normal');
    assert.throws(
      () => resolveThoughtCount('normal', 'q', config, 1),
      (err: unknown) => err instanceof InvalidThoughtCountError
    );
  });
});

describe('resolveThoughtCount — auto-resolve (no targetThoughts)', () => {
  it('returns at least minThoughts for a short query', () => {
    const config = getLevelConfig('basic');
    const count = resolveThoughtCount('basic', 'hi', config);
    assert.ok(count >= config.minThoughts, `${count} >= ${config.minThoughts}`);
  });

  it('returns at most maxThoughts for any query', () => {
    const config = getLevelConfig('normal');
    const longQuery = 'a'.repeat(1000);
    const count = resolveThoughtCount('normal', longQuery, config);
    assert.ok(count <= config.maxThoughts, `${count} <= ${config.maxThoughts}`);
  });

  it('returns higher count for complex multi-sentence query', () => {
    const config = getLevelConfig('normal');
    const simple = resolveThoughtCount('normal', 'short', config);
    const complex = resolveThoughtCount(
      'normal',
      'Compare and analyze the trade-offs of design patterns. Evaluate the architecture. What is the best strategy for the system?',
      config
    );
    assert.ok(complex >= simple, `complex ${complex} >= simple ${simple}`);
  });

  it('returns minThoughts when min === max (fixed config)', () => {
    const fixedConfig = { minThoughts: 5, maxThoughts: 5 };
    const count = resolveThoughtCount('normal', 'any query', fixedConfig);
    assert.equal(count, 5);
  });

  it('stays within bounds for expert level', () => {
    const config = getLevelConfig('expert');
    const count = resolveThoughtCount(
      'expert',
      'design a distributed system',
      config
    );
    assert.ok(count >= config.minThoughts);
    assert.ok(count <= config.maxThoughts);
  });
});

// ---------------------------------------------------------------------------
// countSentences
// ---------------------------------------------------------------------------

describe('countSentences', () => {
  it('returns 0 for empty string', () => {
    assert.equal(countSentences(''), 0);
  });

  it('counts a single sentence', () => {
    const count = countSentences('This is one sentence.');
    assert.ok(count >= 1);
  });

  it('counts multiple sentences', () => {
    const count = countSentences(
      'First sentence. Second sentence. Third sentence.'
    );
    assert.ok(count >= 2);
  });

  it('returns 0 for whitespace-only string', () => {
    assert.equal(countSentences('   '), 0);
  });
});

// ---------------------------------------------------------------------------
// getStructureDensityScore
// ---------------------------------------------------------------------------

describe('getStructureDensityScore', () => {
  it('returns a non-negative number', () => {
    const score = getStructureDensityScore('simple query');
    assert.ok(score >= 0);
  });

  it('returns a higher score for punctuation-heavy text', () => {
    const plain = getStructureDensityScore('simple');
    const complex = getStructureDensityScore(
      'step1, step2; step3: result? yes! done.'
    );
    assert.ok(complex >= plain);
  });

  it('returns 0 or low score for a one-word query', () => {
    const score = getStructureDensityScore('hello');
    assert.ok(score >= 0);
  });
});
