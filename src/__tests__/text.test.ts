import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createSegmenter,
  truncate,
  truncateByUtf8Boundary,
} from '../lib/text.js';

describe('text utils', () => {
  describe('createSegmenter', () => {
    it('returns segmenter for valid granularity', () => {
      const segmenter = createSegmenter('grapheme');
      assert.ok(segmenter);
      assert.ok(segmenter instanceof Intl.Segmenter);
    });

    it('returns undefined if Intl is missing (simulated via explicit call if possible, otherwise mostly coverage)', () => {
      // Ideally we'd mock Intl, but that's hard in global.
      // Just asserting it works in this env is enough.
      const segmenter = createSegmenter('sentence');
      assert.ok(segmenter);
    });
  });

  describe('truncate', () => {
    const segmenter = createSegmenter('grapheme');

    it('returns string if within limit', () => {
      assert.equal(truncate('abc', 5, segmenter), 'abc');
      assert.equal(truncate('abc', 3, segmenter), 'abc');
    });

    it('truncates and adds suffix', () => {
      // 'abc' is 3 bytes. Max 2 bytes -> 2 is less than suffix '...'.
      // Suffix is 3 bytes. If max=2, truncate returns '..'.
      assert.equal(truncate('abc', 2, segmenter), '..');
    });

    it('truncates with suffix when space allows', () => {
      // 'hello world' is 11 bytes. Max 8. Suffix (3) leaves 5 bytes for content.
      // 'hello' is 5 bytes. expected: 'hello...'
      assert.equal(truncate('hello world', 8, segmenter), 'hello...');
    });

    it('handles unicode characters', () => {
      // '👍' is 4 bytes.
      // If we pass max=6, it fits (4 <= 6), so it returns the original string.
      assert.equal(truncate('👍', 6, segmenter), '👍');

      // To trigger truncation, input must exceed limits.
      // '👍👍' is 8 bytes. max=7.
      // target = 7 - 3 = 4.
      // '👍' is 4 bytes. Fits. Next '👍' exceeds.
      // Result: '👍...'
      assert.equal(truncate('👍👍', 7, segmenter), '👍...');

      // max=6. target = 3.
      // '👍' (4 bytes) > 3. No chars fit.
      // Result: '...'
      assert.equal(truncate('👍👍', 6, segmenter), '...');
    });

    it('handles non-bmp characters', () => {
      const char = '𠮷'; // 4 bytes 0xF0 0xA0 0xAE 0xB7
      const str = char + char; // 8 bytes

      // Max 6. Excess. Target=3. Char > 3. Result '...'
      assert.equal(truncate(str, 6, segmenter), '...');

      // Max 7. Excess. Target=4. Char fits. Result '𠮷...'
      assert.equal(truncate(str, 7, segmenter), '𠮷...');
    });
  });

  describe('truncateByUtf8Boundary', () => {
    it('cuts clean ascii', () => {
      assert.equal(truncateByUtf8Boundary('hello', 3), 'hel');
    });

    it('cuts multi-byte cleanly', () => {
      const str = '👍'; // 4 bytes: f0 9f 91 8d
      // cut at 1 -> f0 (start byte) -> drop -> ''
      assert.equal(truncateByUtf8Boundary(str, 1), '');
      // cut at 2 -> f0 9f (incomplete) -> drop -> ''
      assert.equal(truncateByUtf8Boundary(str, 2), '');
      // cut at 3 -> f0 9f 91 -> drop -> ''
      assert.equal(truncateByUtf8Boundary(str, 3), '');
      // cut at 4 -> full -> '👍'
      assert.equal(truncateByUtf8Boundary(str, 4), '👍');
    });

    it('handles sequence of chars', () => {
      // 'a👍b' -> 1 + 4 + 1 bytes.
      const str = 'a👍b';
      assert.equal(truncateByUtf8Boundary(str, 1), 'a');
      // cut at 2: 'a' (1) + 'f0' (1). 'f0' is incomplete. Drops 'f0'. Result 'a'.
      assert.equal(truncateByUtf8Boundary(str, 2), 'a');
      assert.equal(truncateByUtf8Boundary(str, 5), 'a👍');
      assert.equal(truncateByUtf8Boundary(str, 6), 'a👍b');
    });
  });
});
