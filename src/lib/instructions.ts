import { readFileSync } from 'node:fs';

/**
 * Loads the instructions from the instructions.md file. If the file cannot be read or is empty, returns a fallback message.
 */
export function loadInstructions(
  fallback = '(Instructions not available)'
): string {
  try {
    const text = readFileSync(
      new URL('../instructions.md', import.meta.url),
      'utf8'
    ).trim();
    return text.length > 0 ? text : fallback;
  } catch {
    return fallback;
  }
}
