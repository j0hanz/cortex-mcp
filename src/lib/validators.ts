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

/**
 * Parse a boolean from an environment variable, returning `fallback` when absent
 * or when the value is not a recognized boolean literal.
 */
export function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function collectPrefixMatches(
  candidates: readonly string[],
  value: string,
  limit: number
): string[] {
  const results: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.startsWith(value)) {
      continue;
    }
    results.push(candidate);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}
