import { getPromptContracts } from '../lib/mcp.js';
import { getToolContracts } from '../lib/mcp.js';

import { formatSharedConstraints, SERVER_ROLE } from './tool-info.js';

function formatParam(p: {
  name: string;
  type: string;
  required: boolean;
  constraints: string;
}): string {
  const req = p.required ? 'required' : 'optional';
  const desc = p.constraints
    ? ` (${p.type}, ${req}; ${p.constraints})`
    : ` (${p.type}, ${req})`;
  return `- \`${p.name}\`${desc}`;
}

function formatPrompt(p: { name: string; description: string }): string {
  return `- \`${p.name}\`: ${p.description}`;
}

export function buildServerInstructions(): string {
  const toolContracts = getToolContracts();
  const promptContracts = getPromptContracts();

  const toolSections = [...toolContracts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const params = c.params.map(formatParam).join('\n');
      return `### \`${c.name}\`\n- Purpose: ${c.purpose}\n- Model: \`${c.model}\`\n- Parameters:\n${params}`;
    });

  const promptList = promptContracts
    .filter((p) => p.name !== 'get-help')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(formatPrompt)
    .join('\n');

  const sharedConstraints = formatSharedConstraints();

  return `<role>
${SERVER_ROLE}
</role>

<capabilities>
- Single tool: \`reasoning_think\` — creates and continues reasoning sessions.
- Task support: \`forbidden\` for \`reasoning_think\` (no \`tasks/*\` lifecycle methods).
- Sessions: in-memory, 30 min TTL, subscribable.
- Outputs: thought chains, trace markdown, progress notifications.
</capabilities>

<prompts>
- \`get-help\`: Returns these instructions.
${promptList}

> Each \`reasoning.<level>\` prompt embeds a level-specific few-shot example with expected depth and step count.
</prompts>

<resources>
- \`internal://instructions\`: This document.
- \`reasoning://sessions\`: Active sessions list (JSON).
- \`reasoning://sessions/{sessionId}\`: Session thoughts and metadata (JSON).
- \`reasoning://sessions/{sessionId}/trace\`: Full markdown trace.
- \`reasoning://sessions/{sessionId}/thoughts/{thoughtName}\`: Single thought (markdown).
- Notifications: \`notifications/resources/updated\` for session/list updates and \`notifications/resources/list_changed\` for collection changes.
</resources>

<progress>
- Optional \`_meta.progressToken\` in \`tools/call\` enables progress notifications.
- Frequency: every step (basic/normal), every 2 steps (high), every 5 steps (expert).
- \`runMode: "run_to_completion"\`: pass \`thought\` as string array. **Basic level only** — normal/high/expert require step mode.
</progress>

<tool_contracts>
${toolSections.join('\n\n')}
</tool_contracts>

<constraints>
${sharedConstraints}
</constraints>

<error_codes>
- \`E_SESSION_NOT_FOUND\`: Session missing or expired. Start new or list sessions.
- \`E_INVALID_THOUGHT_COUNT\`: \`targetThoughts\` outside level range.
- \`E_INSUFFICIENT_THOUGHTS\`: Too few thoughts for \`run_to_completion\`.
- \`E_INVALID_RUN_MODE_ARGS\`: Invalid \`runMode\` argument combination (e.g. \`run_to_completion\` on non-basic level).
- \`E_INVALID_INPUT\`: Missing or incompatible argument combination handled by the tool.
- \`E_ABORTED\`: Request cancelled. Session marked cancelled.
- \`E_SERVER_BUSY\`: Concurrent request limit reached. Retry later.
- \`E_REASONING\`: Internal error. Check message, retry.
</error_codes>
`;
}
