import type { Session, Thought } from './types.js';

// ---------------------------------------------------------------------------
// Types for extracted trace artifacts
// ---------------------------------------------------------------------------

export interface PinnedSection {
  readonly title: string;
  readonly content: string;
  readonly thoughtIndex: number;
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

const PIN_START = '<!-- pin:';
const PIN_END = '<!-- /pin -->';
const TRACE_SEPARATOR = '\n\n---\n\n';
const PINNED_SECTION_TITLE = '## 📌 Pinned';

/**
 * Extract pinned sections from thought content.
 *
 * Syntax:
 * ```
 * <!-- pin: Title -->
 * Content to pin…
 * <!-- /pin -->
 * ```
 *
 * If the same title appears in multiple thoughts the **latest** one wins.
 */
export function extractPinnedSections(
  thoughts: readonly Thought[]
): readonly PinnedSection[] {
  const byTitle = new Map<string, PinnedSection>();

  for (const thought of thoughts) {
    const { content } = thought;
    if (!content.includes(PIN_START)) {
      continue;
    }
    let searchFrom = 0;

    while (searchFrom < content.length) {
      const startIdx = content.indexOf(PIN_START, searchFrom);
      if (startIdx === -1) {
        break;
      }

      const arrowIdx = content.indexOf('-->', startIdx + PIN_START.length);
      if (arrowIdx === -1) {
        break;
      }

      const title = content.slice(startIdx + PIN_START.length, arrowIdx).trim();

      const contentStart = arrowIdx + 3;
      const endIdx = content.indexOf(PIN_END, contentStart);
      if (endIdx === -1) {
        break;
      }

      const pinContent = content.slice(contentStart, endIdx).trim();
      searchFrom = endIdx + PIN_END.length;

      if (title.length > 0) {
        byTitle.set(title, {
          title,
          content: pinContent,
          thoughtIndex: thought.index,
        });
      }
    }
  }

  return [...byTitle.values()];
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderPinnedSections(sections: readonly PinnedSection[]): string {
  if (sections.length === 0) {
    return '';
  }

  const lines = [PINNED_SECTION_TITLE, ''];
  for (const pin of sections) {
    lines.push(`### ${pin.title} *(Thought ${String(pin.thoughtIndex + 1)})*`);
    if (pin.content.length > 0) {
      lines.push('', pin.content);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// Core formatting
// ---------------------------------------------------------------------------

function formatThoughtHeading(thought: Readonly<Thought>): string {
  const thoughtNumber = thought.index + 1;
  const suffix = thought.revision > 0 ? ' [Revised]' : '';
  return `𖦹 Thought [${String(thoughtNumber)}]${suffix}`;
}

function renderThoughtSection(thought: Readonly<Thought>): string {
  return `${formatThoughtHeading(thought)}\n\n${thought.content}`;
}

function selectThoughts(
  allThoughts: readonly Thought[],
  range?: { start: number; end: number }
): readonly Thought[] {
  if (!range) {
    return allThoughts;
  }

  const startIndex = Math.max(0, range.start - 1);
  const endIndex = Math.min(allThoughts.length, range.end);
  return allThoughts.slice(startIndex, endIndex);
}

/**
 * Format a session's thoughts as Markdown.
 *
 * When called without a `range` (full trace), the output includes the
 * trace header plus any pinned sections extracted from thought content.
 *
 * When called with a `range`, only the requested thought slice is returned
 * (no header, no enhanced sections).
 */
export function formatThoughtsToMarkdown(
  session: Readonly<Session>,
  range?: { start: number; end: number }
): string {
  const { thoughts: allThoughts } = session;
  const isFullTrace = range === undefined;
  const thoughts = selectThoughts(allThoughts, range);
  const hasFullTraceThoughts = isFullTrace && thoughts.length > 0;

  const sections: string[] = [];

  // --- Header ---
  if (hasFullTraceThoughts) {
    sections.push(
      `# Reasoning Trace — [${session.level}]\n` +
        `> Session [${session.id}] · [${String(allThoughts.length)}] thoughts`
    );
  }

  // --- Pinned sections (full trace only) ---
  if (hasFullTraceThoughts) {
    const pinned = extractPinnedSections(thoughts);
    const pinnedMd = renderPinnedSections(pinned);
    if (pinnedMd.length > 0) {
      sections.push(pinnedMd);
    }
  }

  // --- Thought narrative ---
  for (const thought of thoughts) {
    sections.push(renderThoughtSection(thought));
  }

  return sections.join(TRACE_SEPARATOR);
}
