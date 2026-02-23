export type ReasoningLevel = 'basic' | 'normal' | 'high';
export const REASONING_LEVELS = ['basic', 'normal', 'high'] as const;

/** Shared level bounds — single source of truth for min/maxThoughts per level. */
export const LEVEL_BOUNDS = {
  basic: { minThoughts: 3, maxThoughts: 5 },
  normal: { minThoughts: 6, maxThoughts: 10 },
  high: { minThoughts: 15, maxThoughts: 25 },
} as const satisfies Record<
  ReasoningLevel,
  { minThoughts: number; maxThoughts: number }
>;

export type ReasoningRunMode = 'step' | 'run_to_completion';

export type SessionStatus = 'active' | 'completed' | 'cancelled';
export const SESSION_STATUSES = ['active', 'completed', 'cancelled'] as const;

interface Timestamped {
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface TokenTracked {
  readonly tokenBudget: number;
  readonly tokensUsed: number;
}

interface SessionBase extends Timestamped, TokenTracked {
  readonly id: string;
  readonly level: ReasoningLevel;
  readonly status: SessionStatus;
  readonly totalThoughts: number;
}

export interface Thought {
  readonly index: number;
  readonly content: string;
  readonly revision: number;
  readonly stepSummary?: string;
}

export interface Session extends SessionBase {
  readonly thoughts: readonly Thought[];
}

export interface SessionSummary extends SessionBase {
  readonly generatedThoughts: number;
}

export interface LevelConfig {
  readonly minThoughts: number;
  readonly maxThoughts: number;
  readonly tokenBudget: number;
}

export interface IconMeta {
  src: string;
  mimeType: string;
  sizes?: string[];
}
