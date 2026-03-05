// DISABLED: VS Code result.md rendering issue
// import type { TextResourceContents } from '@modelcontextprotocol/sdk/types.js';

import type { Session, Thought } from './types.js';

// --- formatting.ts ---

interface PinnedSection {
  readonly title: string;
  readonly content: string;
  readonly thoughtIndex: number;
}

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

function formatThoughtHeading(thought: Readonly<Thought>): string {
  const thoughtNumber = thought.index + 1;
  const suffix = thought.revision > 0 ? ' [Revised]' : '';
  return `[${String(thoughtNumber)}]${suffix}`;
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

  if (hasFullTraceThoughts) {
    sections.push(
      `# Reasoning Trace — [${session.level}]\n` +
        `> Session [${session.id}] · [${String(allThoughts.length)}] thoughts`
    );
  }

  if (hasFullTraceThoughts) {
    const pinned = extractPinnedSections(thoughts);
    const pinnedMd = renderPinnedSections(pinned);
    if (pinnedMd.length > 0) {
      sections.push(pinnedMd);
    }
  }

  for (const thought of thoughts) {
    sections.push(renderThoughtSection(thought));
  }

  return sections.join(TRACE_SEPARATOR);
}

export type ProgressMessagePhase = 'start' | 'update' | 'complete';

function normalizeProgressSummary(summary?: string): string | undefined {
  if (!summary) {
    return undefined;
  }

  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (normalized.length < 8) {
    return undefined;
  }
  if (/^(step|thought)\s*\d+$/i.test(normalized)) {
    return undefined;
  }
  if (/^[\W_]+$/.test(normalized)) {
    return undefined;
  }
  if (normalized.length > 90) {
    return `${normalized.slice(0, 87).trimEnd()}...`;
  }
  return normalized;
}

export function formatProgressMessage(args: {
  phase: ProgressMessagePhase;
  summary?: string;
  isContinuation?: boolean;
}): string {
  const { phase, summary, isContinuation } = args;

  if (phase === 'start') {
    return isContinuation ? 'Continuing reasoning...' : 'Starting reasoning...';
  }
  if (phase === 'complete') {
    return 'Reasoning complete.';
  }

  const conciseSummary = normalizeProgressSummary(summary);
  if (conciseSummary) {
    return `Reasoning: ${conciseSummary}`;
  }
  return 'Reasoning in progress...';
}

// --- session-utils.ts ---

const DEFAULT_REDACTED_THOUGHT_CONTENT = '[REDACTED]';

interface SessionTtlStore {
  getTtlMs(): number;
  getExpiresAt(sessionId: string): number | undefined;
}

interface SessionLifecycleTarget {
  id: string;
  updatedAt: number;
}

export function requireSession(
  sessionId: string,
  getSession: (sessionId: string) => Readonly<Session> | undefined,
  buildError: (sessionId: string) => Error
): Readonly<Session> {
  const session = getSession(sessionId);
  if (!session) {
    throw buildError(sessionId);
  }
  return session;
}

export function getSessionLifecycle(
  session: Readonly<SessionLifecycleTarget>,
  store: SessionTtlStore
): { ttlMs: number; expiresAt: number } {
  const ttlMs = store.getTtlMs();
  return {
    ttlMs,
    expiresAt: store.getExpiresAt(session.id) ?? session.updatedAt + ttlMs,
  };
}

export function buildSessionView(
  session: Readonly<Session>,
  options?: { redactThoughtContent?: boolean; redactedText?: string }
): Readonly<Session> {
  if (!options?.redactThoughtContent) {
    return session;
  }

  const redactedText = options.redactedText ?? DEFAULT_REDACTED_THOUGHT_CONTENT;

  return {
    ...session,
    thoughts: session.thoughts.map((thought) => ({
      index: thought.index,
      content: redactedText,
      revision: thought.revision,
      ...(thought.stepSummary !== undefined
        ? { stepSummary: redactedText }
        : {}),
    })),
  };
}

// DISABLED: VS Code result.md rendering issue
// export function buildTraceResource(
//   session: Readonly<Session>,
//   redactContent: boolean
// ): TextResourceContents {
//   const sessionView = buildSessionView(session, {
//     redactThoughtContent: redactContent,
//   });
//
//   return {
//     uri: `reasoning://sessions/${session.id}/trace`,
//     mimeType: 'text/markdown',
//     text: formatThoughtsToMarkdown(sessionView),
//   };
// }
