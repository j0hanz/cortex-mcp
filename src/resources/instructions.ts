import { getPromptContracts } from '../lib/prompt-contracts.js';
import { getToolContracts } from '../lib/tool-contracts.js';

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
- Domain: Multi-level reasoning.
- Resources: In-memory sessions (30m TTL), thought chains, progress updates.
- Tool: \`reasoning_think\` (creates/continues sessions).
</capabilities>

<prompts>
- \`get-help\`: Returns these instructions.
${promptList}

> **Guided templates:** Each \`reasoning.<level>\` prompt embeds a level-specific few-shot example showing expected \`thought\` depth and step count.
</prompts>

<resources>
- \`internal://instructions\`: This document.
- \`reasoning://sessions\`: List active sessions (JSON).
- \`reasoning://sessions/{sessionId}\`: Inspect session thoughts/metadata (JSON).
- \`reasoning://sessions/{sessionId}/trace\`: Full Markdown trace.
- \`reasoning://sessions/{sessionId}/thoughts/{thoughtName}\`: Single thought Markdown.
- Subscriptions (\`resources/subscribe\`):
  - \`reasoning://sessions/{sessionId}\`: Updates on thought additions/revisions.
  - \`reasoning://sessions\`: Aggregate session updates.
</resources>

<tasks_and_progress>
- Pass \`_meta.progressToken\` to receive \`notifications/progress\`.
- \`reasoning_think\` supports tasks (\`execution.taskSupport: "optional"\`):
  - Send \`task\` in \`tools/call\` to receive \`taskId\`.
  - Poll \`tasks/get\`, read \`tasks/result\`, abort via \`tasks/cancel\`.
- Progress frequency: \`high\` every 2 steps; \`basic\`/\`normal\` every step.
- For \`runMode: "run_to_completion"\`, pass \`thought\` as a string array.
</tasks_and_progress>

<tool_contracts>
${toolSections.join('\n\n')}
</tool_contracts>

<constraints>
${sharedConstraints}
</constraints>

<error_handling>
- \`E_SESSION_NOT_FOUND\`: Session is missing/expired. List sessions or start a new one.
- \`E_INVALID_THOUGHT_COUNT\`: \`targetThoughts\` outside level range (basic: 1-3, normal: 4-8, high: 10-15, expert: 20-25).
- \`E_INSUFFICIENT_THOUGHTS\`: Too few thought inputs for \`run_to_completion\`.
- \`E_INVALID_RUN_MODE_ARGS\`: Invalid \`runMode\` arguments (for example, missing \`targetThoughts\`).
- \`E_ABORTED\`: Task/session was cancelled.
- \`E_SERVER_BUSY\`: Too many concurrent tasks. Retry later or use sync mode.
- \`E_REASONING\`: Internal reasoning error. Check message and retry.
</error_handling>
`;
}
