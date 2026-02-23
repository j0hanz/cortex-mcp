export type ReasoningLevel = 'basic' | 'normal' | 'high';
export const REASONING_LEVELS = ['basic', 'normal', 'high'] as const;

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
