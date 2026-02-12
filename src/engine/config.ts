import type { LevelConfig, ReasoningLevel } from '../lib/types.js';
import { getTargetThoughtsError } from '../lib/validators.js';

export const LEVEL_CONFIGS: Record<ReasoningLevel, LevelConfig> = {
  basic: { minThoughts: 3, maxThoughts: 5, tokenBudget: 2048 },
  normal: { minThoughts: 6, maxThoughts: 10, tokenBudget: 8192 },
  high: { minThoughts: 15, maxThoughts: 25, tokenBudget: 32768 },
};

export function assertTargetThoughtsInRange(
  level: ReasoningLevel,
  targetThoughts: number
): void {
  const error = getTargetThoughtsError(level, targetThoughts);
  if (error) {
    throw new Error(error);
  }
}
