import type { Session, Thought } from './types.js';

function formatThoughtHeading(thought: Readonly<Thought>): string {
  const thoughtNumber = thought.index + 1;
  const suffix = thought.revision > 0 ? ' [Revised]' : '';
  return `𖦹 Thought [${String(thoughtNumber)}]${suffix}`;
}

export function formatThoughtsToMarkdown(
  session: Readonly<Session>,
  range?: { start: number; end: number }
): string {
  const { thoughts: allThoughts } = session;
  const isFullTrace = range === undefined;

  let thoughts: readonly Thought[];
  if (range) {
    const startIndex = Math.max(0, range.start - 1);
    const endIndex = Math.min(allThoughts.length, range.end);
    thoughts = allThoughts.slice(startIndex, endIndex);
  } else {
    thoughts = allThoughts;
  }

  const sections: string[] = [];

  if (isFullTrace && thoughts.length > 0) {
    sections.push(
      `# Reasoning Trace — [${session.level}]\n` +
        `> Session [${session.id}] · [${String(allThoughts.length)}] thoughts`
    );
  }

  for (const thought of thoughts) {
    const heading = formatThoughtHeading(thought);
    sections.push(`${heading}\n\n${thought.content}`);
  }

  return sections.join('\n\n---\n\n');
}
