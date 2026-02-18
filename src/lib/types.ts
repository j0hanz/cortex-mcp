export type ReasoningLevel = 'basic' | 'normal' | 'high';
export type ReasoningRunMode = 'step' | 'run_to_completion';

export type SessionStatus = 'active' | 'completed' | 'cancelled';

interface Timestamped {
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface TokenTracked {
  readonly tokenBudget: number;
  readonly tokensUsed: number;
}

export interface Thought {
  readonly index: number;
  readonly content: string;
  readonly revision: number;
}

export interface Session extends Timestamped, TokenTracked {
  readonly id: string;
  readonly level: ReasoningLevel;
  readonly status: SessionStatus;
  readonly thoughts: readonly Thought[];
  readonly totalThoughts: number;
}

export interface SessionSummary extends Timestamped, TokenTracked {
  readonly id: string;
  readonly level: ReasoningLevel;
  readonly status: SessionStatus;
  readonly generatedThoughts: number;
  readonly totalThoughts: number;
}

export interface LevelConfig {
  minThoughts: number;
  maxThoughts: number;
  tokenBudget: number;
}

export interface IconMeta {
  src: string;
  mimeType: string;
  sizes?: string[];
}
