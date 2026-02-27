import { LEVEL_BOUNDS, type ReasoningLevel } from './types.js';

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

function readEnv(name: string): string | undefined {
  return process.env[name];
}

function parseEnvInt(raw: string): number | undefined {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function normalizeEnvValue(raw: string): string {
  return raw.trim().toLowerCase();
}

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
  const raw = readEnv(name);
  if (raw === undefined) {
    return fallback;
  }

  const parsed = parseEnvInt(raw);
  if (parsed === undefined || parsed < minimum) {
    return fallback;
  }
  return parsed;
}

/**
 * Parse a boolean from an environment variable, returning `fallback` when absent
 * or when the value is not a recognized boolean literal.
 */
export function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = readEnv(name);
  if (raw === undefined) {
    return fallback;
  }

  const normalized = normalizeEnvValue(raw);
  if (TRUE_ENV_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_ENV_VALUES.has(normalized)) {
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
