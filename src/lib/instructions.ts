import { readFileSync } from 'node:fs';

const INSTRUCTIONS_URL = new URL('../instructions.md', import.meta.url);
const DEFAULT_INSTRUCTIONS_FALLBACK = '(Instructions not available)';

function resolveInstructionsText(text: string, fallback: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Loads the instructions from the instructions.md file. If the file cannot be read or is empty, returns a fallback message.
 */
export function loadInstructions(
  fallback = DEFAULT_INSTRUCTIONS_FALLBACK
): string {
  try {
    const text = readFileSync(INSTRUCTIONS_URL, 'utf8');
    return resolveInstructionsText(text, fallback);
  } catch {
    return fallback;
  }
}
