import { Buffer } from 'node:buffer';

const TOKEN_ESTIMATE_DIVISOR = 3.5;

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

export function estimateTokens(text: string): number {
  const byteLength = Buffer.byteLength(text, 'utf8');
  return Math.max(1, Math.ceil(byteLength / TOKEN_ESTIMATE_DIVISOR));
}
