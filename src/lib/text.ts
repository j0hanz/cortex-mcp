import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

const UTF8 = 'utf8';
const TRUNCATE_SUFFIX = '...';
const TRUNCATE_SUFFIX_BYTES = Buffer.byteLength(TRUNCATE_SUFFIX, UTF8);

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, UTF8);
}

/**
 * Creates an Intl.Segmenter instance if available in the environment.
 * gracefully handles missing Intl support or specific locale issues.
 */
export function createSegmenter(
  granularity: 'grapheme' | 'sentence'
): Intl.Segmenter | undefined {
  if (typeof Intl !== 'object' || typeof Intl.Segmenter !== 'function') {
    return undefined;
  }
  try {
    return new Intl.Segmenter(undefined, { granularity });
  } catch {
    return undefined;
  }
}

/**
 * Truncates a string to fit within a specified byte length, ensuring that it does not cut off in the middle of a grapheme cluster if possible.
 */
export function truncate(
  str: string,
  maxLength: number,
  segmenter?: Intl.Segmenter
): string {
  const maxBytes = clampNonNegative(maxLength);

  if (utf8ByteLength(str) <= maxBytes) {
    return str;
  }

  // If we can't even fit the suffix, just return the suffix truncated (e.g. "." or "..")
  if (maxBytes <= TRUNCATE_SUFFIX_BYTES) {
    return TRUNCATE_SUFFIX.slice(0, maxBytes);
  }

  const targetBytes = maxBytes - TRUNCATE_SUFFIX_BYTES;
  const truncated = truncateByGrapheme(str, targetBytes, segmenter);
  return truncated + TRUNCATE_SUFFIX;
}

function truncateByGrapheme(
  str: string,
  maxBytes: number,
  segmenter?: Intl.Segmenter
): string {
  if (!segmenter) {
    return truncateByUtf8Boundary(str, maxBytes);
  }

  const segments: string[] = [];
  let usedBytes = 0;
  for (const part of segmenter.segment(str)) {
    const segmentBytes = utf8ByteLength(part.segment);
    if (usedBytes + segmentBytes > maxBytes) {
      break;
    }
    segments.push(part.segment);
    usedBytes += segmentBytes;
  }

  return segments.join('');
}

/**
 * Truncates a string to fit within maxBytes, ensuring no partial UTF-8 characters are included.
 * Drops incomplete characters at the end rather than using replacement characters.
 */
export function truncateByUtf8Boundary(str: string, maxBytes: number): string {
  const safeMaxBytes = clampNonNegative(maxBytes);
  const byteLength = utf8ByteLength(str);
  if (byteLength <= safeMaxBytes) {
    return str;
  }
  if (safeMaxBytes === 0) {
    return '';
  }

  const encoded = Buffer.from(str, UTF8);
  const decoder = new StringDecoder(UTF8);
  return decoder.write(encoded.subarray(0, safeMaxBytes));
}
