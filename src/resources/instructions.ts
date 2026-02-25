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
- Primary Resources: Reasoning sessions (in-memory, 30-minute TTL), thought chains, progress notifications.
- Tools: \`reasoning_think\` (WRITE — creates/extends sessions with LLM-authored thoughts).
</capabilities>

<prompts>
- \`get-help\`: Returns these instructions for quick recall.
${promptList}

> **Guided templates:** Each \`reasoning.<level>\` prompt embeds a level-specific few-shot example showing the expected \`thought\` depth and step count. Only the template for the requested level is injected — the other two are omitted to keep prompts lean.
</prompts>

<resources>
- \`internal://instructions\`: This document.
- \`reasoning://sessions\`: List all active reasoning sessions with metadata (JSON).
- \`reasoning://sessions/{sessionId}\`: Inspect a specific session's thoughts and metadata (JSON). Supports auto-completion on \`sessionId\`.
- \`file:///cortex/sessions/{sessionId}/trace.md\`: Full Markdown trace of a session. Supports auto-completion on \`sessionId\`.
- \`file:///cortex/sessions/{sessionId}/{thoughtName}.md\`: Markdown content of a single thought (e.g., \`Thought-1.md\`). Supports auto-completion on \`sessionId\` and \`thoughtName\`.
- The server supports \`resources/subscribe\` for real-time change notifications on individual resources.
- Subscribe to \`reasoning://sessions/{sessionId}\` to receive \`notifications/resources/updated\` when thoughts are added, revised, or status changes.
- Subscribe to \`reasoning://sessions\` to receive aggregate updates as session content and statuses evolve.
- Use subscriptions to monitor session progress without polling.
</resources>

<tasks_and_progress>
- Include \`_meta.progressToken\` in requests to receive \`notifications/progress\` updates during reasoning.
- Task-augmented tool calls are supported for \`reasoning_think\`:
  - \`execution.taskSupport: "optional"\` — invoke normally or as a task.
  - Send \`tools/call\` with \`task\` to get a task id.
  - Poll \`tasks/get\` and fetch results via \`tasks/result\`.
  - Use \`tasks/cancel\` to abort a running task.
  - For \`high\` level, progress is emitted every 2 steps to reduce noise; \`basic\` and \`normal\` emit after every step.
  - Use \`runMode: "run_to_completion"\` with \`thought\` as an array of strings to execute multiple reasoning steps in one request.
</tasks_and_progress>

<tool_contracts>
${toolSections.join('\n\n')}
</tool_contracts>

<constraints>
${sharedConstraints}
</constraints>

<error_handling>
- \`E_SESSION_NOT_FOUND\`: Session expired or never existed. Call \`reasoning://sessions\` to list active sessions, or start a new session without \`sessionId\`.
- \`E_INVALID_THOUGHT_COUNT\`: \`targetThoughts\` is outside the level range. Check ranges: basic (3–5), normal (6–10), high (15–25).
- \`E_INSUFFICIENT_THOUGHTS\`: In \`run_to_completion\`, the request did not provide enough thought inputs for planned remaining steps.
- \`E_INVALID_RUN_MODE_ARGS\`: Invalid \`runMode\` argument combination (for example, missing \`targetThoughts\` when starting a new run-to-completion session).
- \`E_ABORTED\`: Reasoning was cancelled via abort signal or task cancellation. Retry with a new request if needed.
- \`E_SERVER_BUSY\`: Too many concurrent task-mode reasoning calls (default cap: 32). Retry after a short delay, or use normal (non-task) invocation.
- \`E_REASONING\`: Unexpected engine error. Check the error \`message\` field for details and retry.
</error_handling>
`;
}
