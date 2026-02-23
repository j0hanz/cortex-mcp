import { getToolContracts } from '../lib/tool-contracts.js';

import { getSharedConstraints } from './tool-info.js';

function buildToolReference(): string {
  return [...getToolContracts()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (c) =>
        `### \`${c.name}\`\n- Purpose: ${c.purpose}\n- Output: \`${c.outputShape}\``
    )
    .join('\n\n');
}

export function buildWorkflowGuide(): string {
  return `# THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: Sequential Reasoning (Most Common)

1. Call \`reasoning_think\` with \`{ query: "...", level: "basic", thought: "Your detailed reasoning for step 1..." }\`.
2. Read the response — note the \`sessionId\` and \`remainingThoughts\` fields.
3. **You MUST continue**: Call again with \`{ sessionId: "<from response>", thought: "Your next reasoning step..." }\`.
4. Repeat step 3 until the response shows \`status: "completed"\` or \`remainingThoughts: 0\`.
   NOTE: The \`summary\` field contains the exact continuation call you should make next.

### WORKFLOW B: Multi-Turn Reasoning (Session Continuation)

1. Call \`reasoning_think\` with \`{ query: "initial question", level: "normal", thought: "Your first reasoning step..." }\` — note the returned \`sessionId\`.
2. Call \`reasoning_think\` with \`{ sessionId: "<id>", thought: "Your next reasoning step..." }\` (optional: add \`query\` for follow-up context).
3. Repeat until \`status: "completed"\` or \`remainingThoughts: 0\`, then read \`reasoning://sessions/{sessionId}\` for the full chain.
   NOTE: The \`level\` parameter is optional when continuing; if provided and mismatched, the session level is used.

### WORKFLOW C: Controlled Depth Reasoning

1. Call \`reasoning_think\` with \`{ query: "...", level: "normal", targetThoughts: 8, thought: "Your reasoning..." }\` to set the session's planned step count.
2. Repeat calls with the returned \`sessionId\` and your next \`thought\` until \`result.totalThoughts\` is reached.
   NOTE: \`targetThoughts\` must fall within the level range (basic: 3–5, normal: 6–10, high: 15–25). Out-of-range values return \`E_INVALID_THOUGHT_COUNT\`.

### WORKFLOW D: Async Task Execution

1. Call \`reasoning_think\` as a task (send \`tools/call\` with \`task\` field) for long-running \`high\`-level reasoning.
2. Poll \`tasks/get\` until status is \`completed\` or \`failed\`.
3. Retrieve the result via \`tasks/result\`.
4. Use \`tasks/cancel\` to abort if needed.

### WORKFLOW E: Batched Run-To-Completion

1. Start a new session with explicit \`targetThoughts\` and \`runMode: "run_to_completion"\`.
2. Provide one \`thought\` plus additional \`thoughts[]\` entries to cover the planned step count.
3. The server consumes thought inputs in order until completion, token budget exhaustion, or cancellation.

### WORKFLOW F: Structured Reasoning (Observation/Hypothesis/Evaluation)

1. Call \`reasoning_think\` with \`{ query: "...", level: "normal", observation: "facts...", hypothesis: "idea...", evaluation: "critique..." }\`.
2. The server formats these into a structured thought and stores it in the session trace.
3. Continue with \`sessionId\` using either \`thought\` or structured fields for subsequent steps.
4. Use \`is_conclusion: true\` to end early, or \`rollback_to_step\` to discard and redo from a specific step.

## Shared Constraints
${getSharedConstraints()
  .map((c) => `- ${c}`)
  .join('\n')}

## Tool Reference
${buildToolReference()}
`;
}
