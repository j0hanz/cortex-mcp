import { Buffer } from 'node:buffer';

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
 * Truncaties a string to a maximum byte length, respecting grapheme clusters if a segmenter is provided.
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
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= safeMaxBytes) {
    return str;
  }
  if (safeMaxBytes === 0) {
    return '';
  }

  // Backtrack to find a clean cut point for UTF-8
  let end = safeMaxBytes;
  while (end > 0) {
    const byte = encoded[end - 1];
    if (byte === undefined || (byte & 0xc0) !== 0x80) {
      break;
    }
    end--;
  }

  // If we landed on a start byte, check if the sequence is complete
  if (end > 0) {
    const lastByte = encoded[end - 1];
    if (lastByte !== undefined) {
      const charBytes = getUtf8CharLength(lastByte);
      const available = safeMaxBytes - (end - 1);
      if (available < charBytes) {
        end--; // Incomplete character, drop it
      } else {
        end = safeMaxBytes; // Complete character, restore full length
      }
    }
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(encoded.subarray(0, end));
}

function getUtf8CharLength(byte: number): number {
  if ((byte & 0xe0) === 0xc0) return 2;
  if ((byte & 0xf0) === 0xe0) return 3;
  if ((byte & 0xf8) === 0xf0) return 4;
  return 1;
}
