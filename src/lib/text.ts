import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

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
 * Truncates a string to a maximum byte length, respecting grapheme clusters if a segmenter is provided.
 * Appends a suffix '...' if truncation occurs.
 *
 * @param str The string to truncate.
 * @param maxLength The maximum length in bytes.
 * @param segmenter Optional Intl.Segmenter for grapheme-aware truncation.
 */
export function truncate(
  str: string,
  maxLength: number,
  segmenter?: Intl.Segmenter
): string {
  const suffix = '...';
  // If maxLength is negative, treat as 0
  const maxBytes = Math.max(0, maxLength);
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');

  if (Buffer.byteLength(str, 'utf8') <= maxBytes) {
    return str;
  }

  // If we can't even fit the suffix, just return the suffix truncated (e.g. "." or "..")
  if (maxBytes <= suffixBytes) {
    return suffix.slice(0, maxBytes);
  }

  const targetBytes = maxBytes - suffixBytes;
  const truncated = truncateByGrapheme(str, targetBytes, segmenter);
  return truncated + suffix;
}

function truncateByGrapheme(
  str: string,
  maxBytes: number,
  segmenter?: Intl.Segmenter
): string {
  if (!segmenter) {
    return truncateByUtf8Boundary(str, maxBytes);
  }

  let result = '';
  let usedBytes = 0;
  for (const part of segmenter.segment(str)) {
    const segmentBytes = Buffer.byteLength(part.segment, 'utf8');
    if (usedBytes + segmentBytes > maxBytes) {
      break;
    }
    result += part.segment;
    usedBytes += segmentBytes;
  }

  return result;
}

/**
 * Truncates a string to fit within maxBytes, ensuring no partial UTF-8 characters are included.
 * Drops incomplete characters at the end rather than using replacement characters.
 */
export function truncateByUtf8Boundary(str: string, maxBytes: number): string {
  const safeMaxBytes = Math.max(0, maxBytes);
  const encoded = Buffer.from(str, 'utf8');
  if (encoded.length <= safeMaxBytes) {
    return str;
  }
  if (safeMaxBytes === 0) {
    return '';
  }

  const decoder = new StringDecoder('utf8');
  return decoder.write(encoded.subarray(0, safeMaxBytes));
}
