export type ReasoningLevel = 'basic' | 'normal' | 'high';

export type SessionStatus = 'active' | 'completed' | 'cancelled';

export interface Thought {
  index: number;
  content: string;
  revision: number;
}

export interface Session {
  id: string;
  level: ReasoningLevel;
  status: SessionStatus;
  thoughts: Thought[];
  totalThoughts: number;
  /** Approximate token budget (estimated as UTF-8 byte length ÷ 4, not true tokenization). */
  tokenBudget: number;
  /** Approximate tokens used (estimated as UTF-8 byte length ÷ 4, not true tokenization). */
  tokensUsed: number;
  createdAt: number;
  updatedAt: number;
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
