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
### A: Sequential Reasoning (Default)
1. Call \`reasoning_think\` with \`{ query, level, thought }\`.
2. Capture \`sessionId\` and \`remainingThoughts\` from response.
3. Continue: \`{ sessionId, thought }\`. Repeat until \`status: "completed"\` or \`remainingThoughts: 0\`.
   Use \`summary\` field for the exact next call.

### B: Multi-Turn (Follow-Up Queries)
1. Start: \`{ query, level: "normal", thought }\`.
2. Continue: \`{ sessionId, thought }\`. Optionally add \`query\` for follow-ups.
3. Repeat until completed. Read \`reasoning://sessions/{sessionId}\` for full chain.
   \`level\` is optional on continuation — session level applies if omitted.

### C: Controlled Depth
1. Start: \`{ query, level: "normal", targetThoughts: 8, thought }\`.
2. Continue with \`{ sessionId, thought }\` until \`totalThoughts\` reached.
   Ranges: basic 1-3, normal 4-8, high 10-15, expert 20-25.

### D: Batch Run-To-Completion
1. Start: \`{ query, level, targetThoughts, runMode: "run_to_completion", thought: ["step1", "step2", ...] }\`.
2. Server processes all inputs until completion, token exhaustion, or cancellation.

### E: Structured Reasoning
1. Start: \`{ query, level, observation, hypothesis, evaluation }\`.
2. Server formats structured fields into trace thought.
3. Continue with \`{ sessionId, thought }\` or structured fields.
4. Set \`is_conclusion: true\` to end early. Use \`rollback_to_step\` to discard and redo.
</workflows>

<constraints>
${formatSharedConstraints()}
</constraints>

<tool_reference>
${buildToolReference()}
</tool_reference>
`;
}
