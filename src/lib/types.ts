export type ReasoningLevel = 'basic' | 'normal' | 'high';
export type ReasoningRunMode = 'step' | 'run_to_completion';

export type SessionStatus = 'active' | 'completed' | 'cancelled';

export interface Thought {
  readonly index: number;
  readonly content: string;
  readonly revision: number;
}

export interface Session {
  readonly id: string;
  readonly level: ReasoningLevel;
  readonly status: SessionStatus;
  readonly thoughts: readonly Thought[];
  readonly totalThoughts: number;
  readonly tokenBudget: number;
  readonly tokensUsed: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SessionSummary {
  readonly id: string;
  readonly level: ReasoningLevel;
  readonly status: SessionStatus;
  readonly generatedThoughts: number;
  readonly totalThoughts: number;
  readonly tokenBudget: number;
  readonly tokensUsed: number;
  readonly createdAt: number;
  readonly updatedAt: number;
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
