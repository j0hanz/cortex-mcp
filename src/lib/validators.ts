import type { ReasoningLevel } from './types.js';

interface ThoughtBounds {
  minThoughts: number;
  maxThoughts: number;
}

/** Level-specific thought count boundaries for validation. */
const THOUGHT_BOUNDS: Readonly<Record<ReasoningLevel, ThoughtBounds>> =
  Object.freeze({
    basic: Object.freeze({ minThoughts: 3, maxThoughts: 5 }),
    normal: Object.freeze({ minThoughts: 6, maxThoughts: 10 }),
    high: Object.freeze({ minThoughts: 15, maxThoughts: 25 }),
  });

function isOutOfBounds(
  value: number,
  bounds: Readonly<ThoughtBounds>
): boolean {
  return value < bounds.minThoughts || value > bounds.maxThoughts;
}

export function getThoughtBounds(level: ReasoningLevel): {
  minThoughts: number;
  maxThoughts: number;
} {
  return THOUGHT_BOUNDS[level];
}

export function getTargetThoughtsError(
  level: ReasoningLevel,
  targetThoughts: number
): string | undefined {
  if (!Number.isInteger(targetThoughts)) {
    return 'targetThoughts must be an integer';
  }

  const bounds = getThoughtBounds(level);
  if (isOutOfBounds(targetThoughts, bounds)) {
    return `targetThoughts must be between ${String(bounds.minThoughts)} and ${String(bounds.maxThoughts)} for level "${level}" (received ${String(targetThoughts)})`;
  }

  return undefined;
}
