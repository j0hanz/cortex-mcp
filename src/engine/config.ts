import type { LevelConfig, ReasoningLevel } from '../lib/types.js';

export const LEVEL_CONFIGS: Record<ReasoningLevel, LevelConfig> = {
  basic: { minThoughts: 3, maxThoughts: 5, tokenBudget: 2048 },
  normal: { minThoughts: 6, maxThoughts: 10, tokenBudget: 8192 },
  high: { minThoughts: 15, maxThoughts: 25, tokenBudget: 32768 },
};

export function getThoughtBounds(level: ReasoningLevel): {
  minThoughts: number;
  maxThoughts: number;
} {
  const { minThoughts, maxThoughts } = LEVEL_CONFIGS[level];
  return { minThoughts, maxThoughts };
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

export function assertTargetThoughtsInRange(
  level: ReasoningLevel,
  targetThoughts: number
): void {
  const error = getTargetThoughtsError(level, targetThoughts);
  if (error) {
    throw new Error(error);
  }
}
