# CORTEX-MCP INSTRUCTIONS

These instructions are available as a resource (internal://instructions) or prompt (get-help). Load them when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: Multi-level reasoning engine that decomposes queries into structured thought chains at configurable depth levels (basic, normal, high).
- Primary Resources: Reasoning sessions (in-memory, 30-minute TTL), thought chains, progress notifications.
- Tools: `reasoning.think` (WRITE — creates/extends sessions with LLM-authored thoughts).

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.
- `reasoning.basic`: Prepare a basic-depth reasoning request (3–5 thoughts).
- `reasoning.normal`: Prepare a normal-depth reasoning request (6–10 thoughts).
- `reasoning.high`: Prepare a high-depth reasoning request (15–25 thoughts).
- `reasoning.continue`: Continue an existing reasoning session (follow-up query optional).
- `reasoning.retry`: Retry a failed reasoning task with modified parameters.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.
- `reasoning://sessions`: List all active reasoning sessions with metadata (JSON).
- `reasoning://sessions/{sessionId}`: Inspect a specific session's thoughts and metadata (JSON). Supports auto-completion on `sessionId`.
- `file:///cortex/sessions/{sessionId}/trace.md`: Full Markdown trace of a session. Supports auto-completion on `sessionId`.
- `file:///cortex/sessions/{sessionId}/{thoughtName}.md`: Markdown content of a single thought (e.g., `Thought-1.md`). Supports auto-completion on `sessionId` and `thoughtName`.

### Resource Subscriptions

- The server supports `resources/subscribe` for real-time change notifications on individual resources.
- Subscribe to `reasoning://sessions/{sessionId}` to receive `notifications/resources/updated` when thoughts are added, revised, or status changes.
- Subscribe to `reasoning://sessions` to receive aggregate updates as session content and statuses evolve.
- Use subscriptions to monitor session progress without polling.

---

## PROGRESS & TASKS

- Include `_meta.progressToken` in requests to receive `notifications/progress` updates during reasoning.
- Task-augmented tool calls are supported for `reasoning.think`:
  - `execution.taskSupport: "optional"` — invoke normally or as a task.
  - Send `tools/call` with `task` to get a task id.
  - Poll `tasks/get` and fetch results via `tasks/result`.
  - Use `tasks/cancel` to abort a running task.
  - For `high` level, progress is emitted every 2 steps to reduce noise; `basic` and `normal` emit after every step.
  - Use `runMode: "run_to_completion"` with `thought` + `thoughts[]` to execute multiple reasoning steps in one request.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: Sequential Reasoning (Most Common)

1. Call `reasoning.think` with `{ query: "...", level: "basic", thought: "Your detailed reasoning for step 1..." }`.
2. Read the response — note the `sessionId` and `remainingThoughts` fields.
3. **You MUST continue**: Call again with `{ sessionId: "<from response>", level: "<same level>", thought: "Your next reasoning step..." }`.
4. Repeat step 3 until the response shows `status: "completed"` or `remainingThoughts: 0`.
   NOTE: The `summary` field contains the exact continuation call you should make next.

### WORKFLOW B: Multi-Turn Reasoning (Session Continuation)

1. Call `reasoning.think` with `{ query: "initial question", level: "normal", thought: "Your first reasoning step..." }` — note the returned `sessionId`.
2. Call `reasoning.think` with `{ sessionId: "<id>", level: "normal", thought: "Your next reasoning step..." }` (optional: add `query` for follow-up context).
3. Repeat until `status: "completed"` or `remainingThoughts: 0`, then read `reasoning://sessions/{sessionId}` for the full chain.
   NOTE: The `level` MUST match the original session level. Mismatches return `E_SESSION_LEVEL_MISMATCH`.

### WORKFLOW C: Controlled Depth Reasoning

1. Call `reasoning.think` with `{ query: "...", level: "normal", targetThoughts: 8, thought: "Your reasoning..." }` to set the session's planned step count.
2. Repeat calls with the returned `sessionId` and your next `thought` until `result.totalThoughts` is reached.
   NOTE: `targetThoughts` must fall within the level range (basic: 3–5, normal: 6–10, high: 15–25). Out-of-range values return `E_INVALID_THOUGHT_COUNT`.

### WORKFLOW D: Async Task Execution

1. Call `reasoning.think` as a task (send `tools/call` with `task` field) for long-running `high`-level reasoning.
2. Poll `tasks/get` until status is `completed` or `failed`.
3. Retrieve the result via `tasks/result`.
4. Use `tasks/cancel` to abort if needed.

### WORKFLOW E: Batched Run-To-Completion

1. Start a new session with explicit `targetThoughts` and `runMode: "run_to_completion"`.
2. Provide one `thought` plus additional `thoughts[]` entries to cover the planned step count.
3. The server consumes thought inputs in order until completion, token budget exhaustion, or cancellation.

---

## TOOL NUANCES & GOTCHAS

`reasoning.think`

- Purpose: Generate a multi-step reasoning chain for a given query at a specified depth level.
- Input:
  - `query` (string, 1–10,000 chars): The question or problem to reason about. Required when creating a new session; optional when `sessionId` is provided.
  - `level` (enum: `basic` | `normal` | `high`): Controls reasoning depth and token budget. Required for new sessions; optional for continuing sessions.
  - `runMode` (enum: `step` | `run_to_completion`, optional): Execution mode. Defaults to `step`.
  - `thought` (string, 1–100,000 chars, **required**): Your full reasoning content for this step. The server stores this text verbatim as the thought in the session trace. Write your complete analysis, observations, and conclusions here — this is what appears in trace.md.
  - `thoughts` (array of string, optional): Additional thought inputs consumed in order when `runMode` is `run_to_completion`.
  - `targetThoughts` (int, 1–25, optional): Override automatic step count. Must fit within the level range. Optional for existing sessions or `run_to_completion`.
  - `sessionId` (string, 1–128 chars, optional): Continue an existing session. Level is inferred from session if omitted.
- Output: `{ ok, result: { sessionId, level, status, thoughts[], generatedThoughts, requestedThoughts, totalThoughts, remainingThoughts, tokenBudget, tokensUsed, ttlMs, expiresAt, createdAt, updatedAt, summary } }`
- Side effects: Creates or modifies an in-memory session. Sessions expire after 30 minutes of inactivity.
- Gotcha: When `status` is `"active"`, the `summary` field contains the exact next call you should make — follow it to continue the session.
- Gotcha: `remainingThoughts` tells you how many more calls are needed. When it reaches 0, the session is complete.
- Gotcha: `runMode="step"` appends one thought per call. `runMode="run_to_completion"` can append multiple thoughts in one call using `thought` + `thoughts[]`.
- Gotcha: The `thought` content is stored verbatim — the trace shows exactly what you write. Write thorough, structured reasoning for useful traces.
- Gotcha: `requestedThoughts` is the effective requested count for this run: it equals `targetThoughts` when provided, otherwise `totalThoughts`.
- Gotcha: For new sessions in `runMode="run_to_completion"`, provide `targetThoughts` and enough thought inputs to match planned steps.
- Gotcha: Token counting is approximate (UTF-8 byte length ÷ 4), not true tokenization.
- Gotcha: Without `targetThoughts`, the planned step count (`totalThoughts`) is determined by a heuristic based on query length and structural complexity (punctuation markers, keywords like "compare", "analyse", "trade-off").
- Limits: Level ranges — basic: 3–5 thoughts (2K token budget), normal: 6–10 (8K), high: 15–25 (32K).

---

## CROSS-FEATURE RELATIONSHIPS

- Use `reasoning.basic` / `reasoning.normal` / `reasoning.high` prompts to construct a correctly parameterized `reasoning.think` call.
- Use `reasoning.continue` prompt to construct a session-continuation call — it enforces `sessionId` and `level` pairing.
- After calling `reasoning.think`, read `reasoning://sessions/{sessionId}` to retrieve the full session state including all accumulated thoughts.
- Use `reasoning://sessions` to discover active sessions before attempting continuation — avoids `E_SESSION_NOT_FOUND`.

---

## CONSTRAINTS & LIMITATIONS

- Sessions are in-memory — all data is lost on process restart.
- Session TTL: 30 minutes from last update. Expired sessions cannot be recovered.
- Maximum query length: 10,000 characters.
- Token budget enforcement is approximate (character-based proxy, not true tokenization).
- stdio transport only — no HTTP endpoint available.
- Every thought in the trace contains LLM-authored reasoning content provided via the `thought` parameter.
- `targetThoughts` must be an integer within the level's min/max range.
- Session store limits are configurable via `CORTEX_SESSION_TTL_MS`, `CORTEX_MAX_SESSIONS`, and `CORTEX_MAX_TOTAL_TOKENS`.

---

## ENHANCED TRACE FEATURES

The trace.md output can surface structured content from your thoughts. Use these conventions in your `thought` text to produce richer traces:

### Pinned Sections

Mark important content (decisions, requirements, constraints) so it appears in a **📌 Pinned** section at the top of the trace, regardless of which thought step it was written in:

```markdown
<!-- pin: Architecture Decision -->

We chose REST over GraphQL because of X, Y, Z.

<!-- /pin -->
```

- Use any title you want after `pin:`.
- If the same title appears in a later thought, the later content replaces the earlier one (last-write-wins).
- When no pin markers are used, the trace renders as before (header + thoughts only).

---

## ERROR HANDLING STRATEGY

- `E_SESSION_NOT_FOUND`: Session expired or never existed. Call `reasoning://sessions` to list active sessions, or start a new session without `sessionId`.
- `E_INVALID_THOUGHT_COUNT`: `targetThoughts` is outside the level range. Check ranges: basic (3–5), normal (6–10), high (15–25).
- `E_INSUFFICIENT_THOUGHTS`: In `run_to_completion`, the request did not provide enough thought inputs for planned remaining steps.
- `E_INVALID_RUN_MODE_ARGS`: Invalid `runMode` argument combination (for example, missing `targetThoughts` when starting a new run-to-completion session).
- `E_ABORTED`: Reasoning was cancelled via abort signal or task cancellation. Retry with a new request if needed.
- `E_REASONING`: Unexpected engine error. Check the error `message` field for details and retry.

---
