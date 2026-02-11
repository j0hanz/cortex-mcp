# Cortex MCP

[![npm version](https://img.shields.io/npm/v/cortex-mcp?style=flat-square)](https://www.npmjs.com/package/cortex-mcp) [![Node.js](https://img.shields.io/badge/Node.js->=24-3c873a?style=flat-square)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178c6?style=flat-square)](https://www.typescriptlang.org) [![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.26+-ff6600?style=flat-square)](https://modelcontextprotocol.io) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22cortex-mcp%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22cortex-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](vscode-insiders:mcp/install?%7B%22name%22%3A%22cortex-mcp%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22cortex-mcp%40latest%22%5D%7D)

## Overview

Cortex MCP is a multi-level reasoning engine designed for complex problem-solving tasks. It provides structured thought chains at configurable depth levels (basic, normal, high) and supports session continuity for multi-turn interactions. With adaptive step counts, async task support, and an event-driven architecture, Cortex MCP enables advanced reasoning workflows while maintaining structured output and robust session management.

## Key Features

- **Three reasoning depth levels** — basic (3–5 steps), normal (6–10 steps), and high (15–25 steps) with corresponding token budgets
- **Session continuity** — resume prior reasoning sessions by ID without losing context
- **Adaptive step count** — automatically scales thought count based on query complexity, or override with an explicit target
- **Async task support** — long-running reasoning can execute as a background task with progress notifications
- **Event-driven engine** — internal event emitter for session lifecycle and thought tracking
- **Structured output** — typed JSON responses with discriminated success/error unions
- **Session resources** — inspect active sessions and individual session details via MCP resources
- **Prompt templates** — pre-built prompts for each depth level and session continuation

## Tech Stack

| Component       | Details                             |
| --------------- | ----------------------------------- |
| Runtime         | Node.js >= 24                       |
| Language        | TypeScript 5.9+ (strict mode)       |
| MCP SDK         | `@modelcontextprotocol/sdk` ^1.26.0 |
| Validation      | `zod` ^4.3.6                        |
| Transport       | stdio                               |
| Test Runner     | `node:test` (native)                |
| Package Manager | npm                                 |

## Repository Structure

```
cortex-mcp/
├── src/
│   ├── index.ts              # Entry point (stdio transport)
│   ├── server.ts             # Server factory & registration
│   ├── instructions.md       # Server instructions (bundled)
│   ├── engine/               # Core reasoning logic
│   │   ├── config.ts          # Level configurations
│   │   ├── context.ts         # AsyncLocalStorage context
│   │   ├── events.ts          # Typed event emitter
│   │   ├── reasoner.ts        # Reasoning orchestrator
│   │   └── session-store.ts   # Session lifecycle & TTL
│   ├── schemas/              # Zod input/output schemas
│   ├── tools/                # MCP tool implementations
│   ├── prompts/              # MCP prompt templates
│   ├── resources/            # MCP resource handlers
│   └── lib/                  # Shared types, errors, utilities
├── scripts/
│   └── tasks.mjs             # Custom build/test task runner
├── package.json
└── tsconfig.json
```

## Requirements

- **Node.js** >= 24

## Quickstart

Run without installing:

```bash
npx -y cortex-mcp@latest
```

Then configure your MCP client to connect via stdio. For example, in VS Code (`settings.json`):

```json
{
  "mcp": {
    "servers": {
      "cortex-mcp": {
        "command": "npx",
        "args": ["-y", "cortex-mcp@latest"]
      }
    }
  }
}
```

## Installation

### NPX (recommended)

```bash
npx -y cortex-mcp@latest
```

### Global Install

```bash
npm install -g cortex-mcp
cortex-mcp
```

### From Source

```bash
git clone https://github.com/j0hanz/cortex-mcp.git
cd cortex-mcp
npm install
npm run build
node dist/index.js
```

## Configuration

### Reasoning Levels

| Level    | Thoughts | Token Budget | Use Case                                    |
| -------- | -------- | ------------ | ------------------------------------------- |
| `basic`  | 3–5      | 2,048        | Quick analysis, simple questions            |
| `normal` | 6–10     | 8,192        | Moderate complexity, multi-faceted problems |
| `high`   | 15–25    | 32,768       | Deep analysis, complex trade-offs           |

### Session Behavior

| Setting             | Value                         |
| ------------------- | ----------------------------- |
| Session TTL         | 30 minutes (from last update) |
| Auto-sweep interval | Every 60 seconds              |
| Session ID format   | UUID v4                       |

## MCP Surface

### Tools

#### `reasoning.think`

Perform multi-step reasoning on a query. Supports three depth levels and optional session continuation. Can run synchronously or as an async background task.

**Parameters**

| Name             | Type                            | Required | Default | Description                                                       |
| ---------------- | ------------------------------- | -------- | ------- | ----------------------------------------------------------------- |
| `query`          | `string`                        | Yes      | —       | The question or problem to reason about (1–10,000 chars)          |
| `level`          | `"basic" \| "normal" \| "high"` | Yes      | —       | Reasoning depth level                                             |
| `targetThoughts` | `integer`                       | No       | Auto    | Explicit thought count; must fit the selected level range (1–25)  |
| `sessionId`      | `string`                        | No       | —       | Session ID to continue a previous reasoning session (1–128 chars) |

**Success Response**

```json
{
  "ok": true,
  "result": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "level": "normal",
    "thoughts": [
      {
        "index": 0,
        "content": "Step 1/6: Understanding the problem...",
        "revision": 0
      },
      {
        "index": 1,
        "content": "Step 2/6: Identifying key components...",
        "revision": 0
      }
    ],
    "generatedThoughts": 6,
    "requestedThoughts": 6,
    "totalThoughts": 6,
    "tokenBudget": 8192,
    "tokensUsed": 384,
    "ttlMs": 1800000,
    "expiresAt": 1739289524000,
    "createdAt": 1739287724000,
    "updatedAt": 1739287724000,
    "summary": "Generated 6 out of 6 thoughts at level \"normal\"."
  }
}
```

**Error Response**

```json
{
  "ok": false,
  "error": {
    "code": "E_SESSION_NOT_FOUND",
    "message": "Session not found: <sessionId>"
  }
}
```

**Error Codes**

| Code                       | Cause                                                  |
| -------------------------- | ------------------------------------------------------ |
| `E_ABORTED`                | Reasoning was aborted or task was cancelled            |
| `E_INVALID_THOUGHT_COUNT`  | `targetThoughts` outside the level's allowed range     |
| `E_SESSION_NOT_FOUND`      | Provided `sessionId` does not exist or has expired     |
| `E_SESSION_LEVEL_MISMATCH` | Continuation level does not match the existing session |
| `E_REASONING`              | Unexpected reasoning engine error                      |

**Task Support**

The tool supports optional async execution. When invoked as a task, reasoning runs in the background with progress notifications and the result can be polled via `tasks/get` and `tasks/result`.

### Resources

| URI Pattern                        | Description                                          | MIME Type          |
| ---------------------------------- | ---------------------------------------------------- | ------------------ |
| `reasoning://sessions`             | List all active reasoning sessions                   | `application/json` |
| `reasoning://sessions/{sessionId}` | Inspect a specific session with full thought history | `application/json` |

### Prompts

| Name                 | Description                                         | Arguments                                                                 |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `reasoning.basic`    | Prepare a basic-depth reasoning request             | `query` (required), `targetThoughts` (optional)                           |
| `reasoning.normal`   | Prepare a normal-depth reasoning request            | `query` (required), `targetThoughts` (optional)                           |
| `reasoning.high`     | Prepare a high-depth reasoning request              | `query` (required), `targetThoughts` (optional)                           |
| `reasoning.continue` | Continue an existing session with a follow-up query | `sessionId`, `query`, `level` (all required), `targetThoughts` (optional) |

## Client Configuration Examples

<details>
<summary>VS Code</summary>

Add to your `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "cortex-mcp": {
        "command": "npx",
        "args": ["-y", "cortex-mcp@latest"]
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Desktop</summary>

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "cortex-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

[Install with one click](https://cursor.com/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvcnRleC1tY3BAbGF0ZXN0Il19) or add to your Cursor MCP config:

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "cortex-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

Add to your Windsurf MCP config:

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "cortex-mcp@latest"]
    }
  }
}
```

</details>

## Security

- **stdio transport** — the server communicates exclusively over stdin/stdout. All diagnostic output is written to stderr to prevent stdout pollution.
- **Input validation** — all tool inputs are validated via strict Zod schemas with enforced length limits and type constraints.
- **No network access** — the server makes no outbound network requests; all reasoning is performed locally in-memory.

## Development

### Scripts

| Script                  | Command                                   | Purpose                                |
| ----------------------- | ----------------------------------------- | -------------------------------------- |
| `npm run build`         | `node scripts/tasks.mjs build`            | Clean, compile TypeScript, copy assets |
| `npm run dev`           | `tsc --watch`                             | Watch mode compilation                 |
| `npm run dev:run`       | `node --watch dist/index.js`              | Run with auto-restart on changes       |
| `npm start`             | `node dist/index.js`                      | Start the server                       |
| `npm test`              | `node scripts/tasks.mjs test`             | Build + run tests                      |
| `npm run test:fast`     | `node --test --import tsx/esm ...`        | Run tests without rebuild              |
| `npm run test:coverage` | `node scripts/tasks.mjs test --coverage`  | Tests with coverage                    |
| `npm run type-check`    | `tsc --noEmit`                            | Type-check without emitting            |
| `npm run lint`          | `eslint .`                                | Lint source files                      |
| `npm run lint:fix`      | `eslint . --fix`                          | Lint and auto-fix                      |
| `npm run format`        | `prettier --write .`                      | Format all files                       |
| `npm run inspector`     | Build + `@modelcontextprotocol/inspector` | Launch MCP Inspector                   |

### Testing with MCP Inspector

```bash
npm run inspector
```

This builds the server and opens the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) UI, allowing you to interactively test tools, prompts, and resources.

## Troubleshooting

| Issue                     | Solution                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npx` fails to start      | Ensure Node.js >= 24 is installed (`node --version`)                                                         |
| Session not found errors  | Sessions expire after 30 minutes of inactivity; start a new session                                          |
| `targetThoughts` rejected | Value must be within the selected level's range (basic: 3–5, normal: 6–10, high: 15–25)                      |
| No output visible         | The server uses stdio transport — stdout is reserved for MCP protocol messages; check stderr for diagnostics |

## Contributing & License

MIT — see [LICENSE](LICENSE) for details.
