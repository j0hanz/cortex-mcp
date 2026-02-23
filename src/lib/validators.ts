import { LEVEL_BOUNDS, type ReasoningLevel } from './types.js';

function isOutOfBounds(
  value: number,
  bounds: Readonly<{ minThoughts: number; maxThoughts: number }>
): boolean {
  return value < bounds.minThoughts || value > bounds.maxThoughts;
}

export function getThoughtBounds(level: ReasoningLevel): {
  minThoughts: number;
  maxThoughts: number;
} {
  return LEVEL_BOUNDS[level];
}

export function getTargetThoughtsError(
  level: ReasoningLevel,
  targetThoughts: number
): string | undefined {
  if (!Number.isInteger(targetThoughts)) {
    return 'targetThoughts must be an integer';
  }

  const levelBounds = getThoughtBounds(level);
  if (isOutOfBounds(targetThoughts, levelBounds)) {
    return `targetThoughts must be between ${String(levelBounds.minThoughts)} and ${String(levelBounds.maxThoughts)} for level "${level}" (received ${String(targetThoughts)})`;
  }

  return undefined;
}

/**
 * Parse a positive integer from an environment variable, returning `fallback`
 * if the variable is absent or invalid. Values below `minimum` also fall back.
 */
export function parsePositiveIntEnv(
  name: string,
  fallback: number,
  minimum = 1
): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    return fallback;
  }
  return parsed;
}
