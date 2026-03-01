import { sessionStore } from '../engine/reasoner.js';

import { REASONING_LEVELS, type ReasoningLevel } from './types.js';
import { collectPrefixMatches } from './validators.js';

const MAX_COMPLETION_RESULTS = 20;

export function completeSessionIds(value: string): string[] {
  return collectPrefixMatches(
    sessionStore.listSessionIds(),
    value,
    MAX_COMPLETION_RESULTS
  );
}

export function completeLevel(value: string): ReasoningLevel[] {
  const normalized = value.toLowerCase();
  const results: ReasoningLevel[] = [];
  for (const level of REASONING_LEVELS) {
    if (level.startsWith(normalized)) {
      results.push(level);
    }
  }
  return results;
}
