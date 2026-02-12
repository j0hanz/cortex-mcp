import type { ReasoningLevel } from './types.js';

/** Level-specific thought count boundaries for validation. */
const THOUGHT_BOUNDS: Record<ReasoningLevel, { min: number; max: number }> = {
  basic: { min: 3, max: 5 },
  normal: { min: 6, max: 10 },
  high: { min: 15, max: 25 },
};

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

  const { minThoughts, maxThoughts } = getThoughtBounds(level);
  if (targetThoughts < minThoughts || targetThoughts > maxThoughts) {
    return `targetThoughts must be between ${String(minThoughts)} and ${String(maxThoughts)} for the selected level`;
  }

  return undefined;
}
