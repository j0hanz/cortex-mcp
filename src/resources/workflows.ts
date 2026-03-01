import {
  buildToolReference,
  formatSharedConstraints,
  SERVER_ROLE,
} from './tool-info.js';

export function buildWorkflowGuide(): string {
  return `<role>
${SERVER_ROLE}
</role>

<workflows>
### WORKFLOW A: Sequential Reasoning (Most Common)
1. Call \`reasoning_think\` with \`{ query: "...", level: "basic", thought: "..." }\`.
2. Read the response and capture \`sessionId\` and \`remainingThoughts\`.
3. Continue with \`{ sessionId: "<id>", thought: "..." }\`.
4. Repeat until \`status: "completed"\` or \`remainingThoughts: 0\`.
   NOTE: \`summary\` field contains the exact next call.

### WORKFLOW B: Multi-Turn Reasoning
1. Call \`reasoning_think\` with \`{ query: "...", level: "normal", thought: "..." }\`.
2. Continue with \`{ sessionId: "<id>", thought: "..." }\` (optional: add \`query\` for follow-up).
3. Repeat until completed. Read \`reasoning://sessions/{sessionId}\` for full chain.
   NOTE: \`level\` is optional when continuing; session level is used if omitted.

### WORKFLOW C: Controlled Depth
1. Call \`reasoning_think\` with \`{ query: "...", level: "normal", targetThoughts: 8, thought: "..." }\`.
2. Repeat with \`sessionId\` and \`thought\` until \`totalThoughts\` reached.
   NOTE: \`targetThoughts\` must fit level range (basic: 1-3, normal: 4-8, high: 10-15, expert: 20-25).

### WORKFLOW D: Async Task
1. Call \`reasoning_think\` as task (send \`task\` field) for long \`high\`-level reasoning.
2. Poll \`tasks/get\` until \`completed\`/\`failed\`.
3. Read final output via \`tasks/result\`.
4. Abort via \`tasks/cancel\`.

### WORKFLOW E: Batched Run-To-Completion
1. Start session with \`targetThoughts\` and \`runMode: "run_to_completion"\`.
2. Provide \`thought\` as string array (e.g., \`["step1", "step2"]\`).
3. The server consumes inputs until completion, token exhaustion, or cancellation.

### WORKFLOW F: Structured Reasoning
1. Call \`reasoning_think\` with \`{ query: "...", level: "normal", observation: "...", hypothesis: "...", evaluation: "..." }\`.
2. Server formats into structured thought in trace.
3. Continue with \`sessionId\` using \`thought\` or structured fields.
4. Use \`is_conclusion: true\` to end early, or \`rollback_to_step\` to discard/redo.
</workflows>

<constraints>
${formatSharedConstraints()}
</constraints>

<tool_reference>
${buildToolReference()}
</tool_reference>
`;
}
