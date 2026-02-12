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
  tokenBudget: number;
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
