import { getPromptContracts } from '../lib/prompt-contracts.js';
import { getToolContracts } from '../lib/tool-contracts.js';

import { getSharedConstraints } from './tool-info.js';

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

  const sharedConstraints = getSharedConstraints()
    .map((c) => `- ${c}`)
    .join('\n');

  return `<role>
You are an expert reasoning engine assistant. You decompose queries into structured thought chains at configurable depth levels (basic, normal, high).
</role>

<capabilities>
- Domain: Multi-level reasoning engine.
- Resources: Sessions (in-memory, 30m TTL), thought chains, progress notifications.
- Tools: \`reasoning_think\` (WRITE: creates/extends sessions).
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
- \`file:///cortex/sessions/{sessionId}/trace.md\`: Full Markdown trace.
- \`file:///cortex/sessions/{sessionId}/{thoughtName}.md\`: Single thought Markdown.
- Subscriptions (\`resources/subscribe\`):
  - \`reasoning://sessions/{sessionId}\`: Updates on thought additions/revisions.
  - \`reasoning://sessions\`: Aggregate session updates.
</resources>

<tasks_and_progress>
- Pass \`_meta.progressToken\` for \`notifications/progress\`.
- \`reasoning_think\` supports tasks (\`execution.taskSupport: "optional"\`):
  - Send \`task\` in \`tools/call\` to get \`taskId\`.
  - Poll \`tasks/get\`, fetch via \`tasks/result\`, abort via \`tasks/cancel\`.
- Progress emission: \`high\` level every 2 steps; \`basic\`/\`normal\` every step.
- \`runMode: "run_to_completion"\`: Pass \`thought\` as string array for batch execution.
</tasks_and_progress>

<tool_contracts>
${toolSections.join('\n\n')}
</tool_contracts>

<constraints>
${sharedConstraints}
</constraints>

<error_handling>
- \`E_SESSION_NOT_FOUND\`: Expired/missing. List sessions or start new.
- \`E_INVALID_THOUGHT_COUNT\`: \`targetThoughts\` out of range (basic: 3-5, normal: 6-10, high: 15-25).
- \`E_INSUFFICIENT_THOUGHTS\`: Not enough inputs for \`run_to_completion\`.
- \`E_INVALID_RUN_MODE_ARGS\`: Invalid \`runMode\` args (e.g., missing \`targetThoughts\`).
- \`E_ABORTED\`: Cancelled. Retry if needed.
- \`E_SERVER_BUSY\`: Too many concurrent tasks. Retry later or use sync mode.
- \`E_REASONING\`: Engine error. Check message and retry.
</error_handling>
`;
}
