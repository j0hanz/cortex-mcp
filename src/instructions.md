# cortex-mcp

## Overview

`cortex-mcp` is a multi-level reasoning MCP server that exposes a single `reasoning.think` tool. It performs structured step-by-step reasoning at configurable depth levels.

## Tool: `reasoning.think`

### Parameters

| Parameter        | Type                            | Required | Description                                                  |
| ---------------- | ------------------------------- | -------- | ------------------------------------------------------------ |
| `query`          | `string`                        | Yes      | The question or problem to reason about (1-10000 chars)      |
| `level`          | `"basic" \| "normal" \| "high"` | Yes      | Reasoning depth level                                        |
| `targetThoughts` | `number`                        | No       | Optional exact thought count (must fit selected level range) |
| `sessionId`      | `string`                        | No       | Optional session ID to continue a previous reasoning session |

### Levels

- **basic**: 3-5 reasoning steps, ~2k token budget. Use for simple questions.
- **normal**: 6-10 reasoning steps, ~8k token budget. Use for moderate complexity.
- **high**: 15-25 reasoning steps, ~16-32k token budget. Use for complex analysis.

### Output

Returns a structured result with:

- `sessionId`: Unique session identifier for follow-up queries
- `level`: The reasoning level used
- `thoughts`: Array of reasoning steps (index, content, revision count)
- `generatedThoughts`: Number of thoughts generated in this call
- `requestedThoughts`: Echoed `targetThoughts` value when provided
- `totalThoughts`: Number of thoughts generated
- `tokenBudget`: Maximum token budget for the level
- `tokensUsed`: Approximate tokens consumed
- `ttlMs`: Session time-to-live in milliseconds
- `expiresAt`: Epoch milliseconds when session is scheduled to expire
- `createdAt`: Session creation timestamp (epoch milliseconds)
- `updatedAt`: Session update timestamp (epoch milliseconds)
- `summary`: Human-readable summary of this run

### Usage Tips

- Start with `basic` for simple factual queries
- Use `normal` for multi-step problems
- Reserve `high` for complex analysis requiring thorough examination
- Set `targetThoughts` when you need explicit control over step count
- Pass `sessionId` to continue reasoning in an existing session
