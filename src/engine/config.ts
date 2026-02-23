import {
  LEVEL_BOUNDS,
  type LevelConfig,
  type ReasoningLevel,
} from '../lib/types.js';
import { getTargetThoughtsError } from '../lib/validators.js';

export const LEVEL_CONFIGS = {
  basic: { ...LEVEL_BOUNDS.basic, tokenBudget: 2048 },
  normal: { ...LEVEL_BOUNDS.normal, tokenBudget: 8192 },
  high: { ...LEVEL_BOUNDS.high, tokenBudget: 32768 },
} as const satisfies Record<ReasoningLevel, LevelConfig>;

export function getLevelConfig(level: ReasoningLevel): LevelConfig {
  return LEVEL_CONFIGS[level];
}

export function assertTargetThoughtsInRange(
  level: ReasoningLevel,
  targetThoughts: number
): void {
  const errorMessage = getTargetThoughtsError(level, targetThoughts);
  if (!errorMessage) {
    return;
  }

  throw new Error(errorMessage);
}

export function getLevelDescriptionString(): string {
  return Object.entries(LEVEL_CONFIGS)
    .map(([level, config]) => {
      const budgetK = Math.round(config.tokenBudget / 1024);
      return `${level} (${config.minThoughts}–${config.maxThoughts} steps, ${budgetK}K budget)`;
    })
    .join(', ');
}
