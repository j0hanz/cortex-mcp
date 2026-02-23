import { Buffer } from 'node:buffer';

import { createSegmenter } from '../lib/text.js';
import type { LevelConfig, ReasoningLevel } from '../lib/types.js';

import { assertTargetThoughtsInRange } from './config.js';

const NON_WHITESPACE = /\S/u;
const COMPLEXITY_KEYWORDS =
  /\b(compare|analy[sz]e|trade[- ]?off|design|plan|critique|evaluate|review|architecture)\b/i;

let _sentenceSegmenter: Intl.Segmenter | undefined;
let _sentenceSegmenterInitialized = false;

function getSentenceSegmenter(): Intl.Segmenter | undefined {
  if (!_sentenceSegmenterInitialized) {
    _sentenceSegmenter = createSegmenter('sentence');
    _sentenceSegmenterInitialized = true;
  }
  return _sentenceSegmenter;
}

export function countSentences(queryText: string): number {
  const segmenter = getSentenceSegmenter();
  if (!segmenter) {
    return 0;
  }

  let count = 0;
  for (const sentence of segmenter.segment(queryText)) {
    if (NON_WHITESPACE.test(sentence.segment)) {
      count++;
    }
  }
  return count;
}

export function getStructureDensityScore(queryText: string): number {
  const sentenceCount = countSentences(queryText);
  if (sentenceCount > 1) {
    return (sentenceCount - 1) * 0.08;
  }

  let markerMatches = 0;
  for (let index = 0; index < queryText.length; index++) {
    switch (queryText.charCodeAt(index)) {
      case 63: // ?
      case 58: // :
      case 59: // ;
      case 44: // ,
      case 10: // \n
        markerMatches += 1;
        break;
      default:
        break;
    }
  }

  return markerMatches * 0.05;
}

export function resolveThoughtCount(
  level: ReasoningLevel,
  query: string,
  config: Pick<LevelConfig, 'minThoughts' | 'maxThoughts'>,
  targetThoughts?: number
): number {
  if (targetThoughts !== undefined) {
    assertTargetThoughtsInRange(level, targetThoughts);
    return targetThoughts;
  }

  if (config.minThoughts === config.maxThoughts) {
    return config.minThoughts;
  }

  const queryText = query.trim();
  const span = config.maxThoughts - config.minThoughts;

  const queryByteLength = Buffer.byteLength(queryText, 'utf8');
  const lengthScore = Math.min(1, queryByteLength / 400);
  const structureScore = Math.min(0.4, getStructureDensityScore(queryText));
  const keywordScore = COMPLEXITY_KEYWORDS.test(queryText) ? 0.25 : 0;
  const score = Math.min(1, lengthScore + structureScore + keywordScore);

  return config.minThoughts + Math.round(span * score);
}
