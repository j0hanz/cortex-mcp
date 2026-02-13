import type { ReasoningLevel } from './types.js';

interface ThoughtBounds {
  min: number;
  max: number;
}

/** Level-specific thought count boundaries for validation. */
const THOUGHT_BOUNDS: Record<ReasoningLevel, ThoughtBounds> = {
  basic: { min: 3, max: 5 },
  normal: { min: 6, max: 10 },
  high: { min: 15, max: 25 },
};

function isOutOfBounds(value: number, bounds: ThoughtBounds): boolean {
  return value < bounds.min || value > bounds.max;
}

export function getThoughtBounds(level: ReasoningLevel): {
  minThoughts: number;
  maxThoughts: number;
} {
  const { min, max } = THOUGHT_BOUNDS[level];
  return { minThoughts: min, maxThoughts: max };
}

export function getTargetThoughtsError(
  level: ReasoningLevel,
  targetThoughts: number
): string | undefined {
  if (!Number.isInteger(targetThoughts)) {
    return 'targetThoughts must be an integer';
  }

  const bounds = THOUGHT_BOUNDS[level];
  if (isOutOfBounds(targetThoughts, bounds)) {
    return `targetThoughts must be between ${String(bounds.min)} and ${String(bounds.max)} for level "${level}" (received ${String(targetThoughts)})`;
  }

  return undefined;
}
