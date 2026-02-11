# CORTEX-MCP INSTRUCTIONS

These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: Multi-level reasoning engine that decomposes queries into structured thought chains at configurable depth levels (basic, normal, high).
- Primary Resources: Reasoning sessions (in-memory, 30-minute TTL), thought chains, progress notifications.
- Tools: `reasoning.think` (WRITE — creates/extends sessions with generated thoughts).

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.
- `reasoning.basic`: Prepare a basic-depth reasoning request (3–5 thoughts).
- `reasoning.normal`: Prepare a normal-depth reasoning request (6–10 thoughts).
- `reasoning.high`: Prepare a high-depth reasoning request (15–25 thoughts).
- `reasoning.continue`: Continue an existing reasoning session with a follow-up query.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.
- `reasoning://sessions`: List all active reasoning sessions with metadata (JSON).
- `reasoning://sessions/{sessionId}`: Inspect a specific session's thoughts and metadata (JSON). Supports auto-completion on `sessionId`.

### Resource Subscriptions

- The server supports `resources/subscribe` for real-time change notifications on individual resources.
- Subscribe to `reasoning://sessions/{sessionId}` to receive `notifications/resources/updated` when thoughts are added or revised.
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

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: Sequential Reasoning

1. Call `reasoning.think` with `{ query: "...", level: "basic" | "normal" | "high" }`.
2. Read `result.thoughts` for the accumulated reasoning chain (each call appends at most one new thought).
3. Repeat calls with the same `sessionId` until `result.totalThoughts` is reached.
   NOTE: Choose level based on query complexity — `basic` for straightforward questions, `high` for multi-faceted analysis.

### WORKFLOW B: Multi-Turn Reasoning (Session Continuation)

1. Call `reasoning.think` with `{ query: "initial question", level: "normal" }` — note the returned `sessionId`.
2. Call `reasoning.think` with `{ query: "follow-up", level: "normal", sessionId: "<id>" }` to append the next thought.
3. Repeat until `result.totalThoughts` is reached, then read `reasoning://sessions/{sessionId}` for the full chain.
   NOTE: The `level` MUST match the original session level. Mismatches return `E_SESSION_LEVEL_MISMATCH`.

### WORKFLOW C: Controlled Depth Reasoning

1. Call `reasoning.think` with `{ query: "...", level: "normal", targetThoughts: 8 }` to set the session's planned step count.
2. Repeat calls with the returned `sessionId` until `result.totalThoughts` is reached.
   NOTE: `targetThoughts` must fall within the level range (basic: 3–5, normal: 6–10, high: 15–25). Out-of-range values return `E_INVALID_THOUGHT_COUNT`.

### WORKFLOW D: Async Task Execution

1. Call `reasoning.think` as a task (send `tools/call` with `task` field) for long-running `high`-level reasoning.
2. Poll `tasks/get` until status is `completed` or `failed`.
3. Retrieve the result via `tasks/result`.
4. Use `tasks/cancel` to abort if needed.

---

## TOOL NUANCES & GOTCHAS

`reasoning.think`

- Purpose: Generate a multi-step reasoning chain for a given query at a specified depth level.
- Input:
  - `query` (string, 1–10,000 chars): The question or problem to reason about.
  - `level` (enum: `basic` | `normal` | `high`): Controls reasoning depth and token budget.
  - `targetThoughts` (int, 1–25, optional): Override automatic step count. Must fit within the level range.
  - `sessionId` (string, 1–128 chars, optional): Continue an existing session. Level must match.
- Output: `{ ok, result: { sessionId, level, thoughts[], generatedThoughts, requestedThoughts, totalThoughts, tokenBudget, tokensUsed, ttlMs, expiresAt, createdAt, updatedAt, summary } }`
- Side effects: Creates or modifies an in-memory session. Sessions expire after 30 minutes of inactivity.
- Gotcha: Each call appends at most one thought. When continuing a session, `generatedThoughts` reflects only the newly added thought (0 or 1), not the cumulative total.
- Gotcha: `requestedThoughts` is the effective requested count for this run: it equals `targetThoughts` when provided, otherwise `totalThoughts`.
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
- Reasoning steps are structural decompositions, not LLM-generated content.
- `targetThoughts` must be an integer within the level's min/max range.

---

## ERROR HANDLING STRATEGY

- `E_SESSION_NOT_FOUND`: Session expired or never existed. Call `reasoning://sessions` to list active sessions, or start a new session without `sessionId`.
- `E_SESSION_LEVEL_MISMATCH`: Requested level differs from the existing session. Use the same level as the original session, or start a new session.
- `E_INVALID_THOUGHT_COUNT`: `targetThoughts` is outside the level range. Check ranges: basic (3–5), normal (6–10), high (15–25).
- `E_ABORTED`: Reasoning was cancelled via abort signal or task cancellation. Retry with a new request if needed.
- `E_REASONING`: Unexpected engine error. Check the error `message` field for details and retry.

---
