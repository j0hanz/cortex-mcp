# Cortex MCP

[![npm version](https://img.shields.io/npm/v/cortex-mcp?style=flat-square)](https://www.npmjs.com/package/cortex-mcp) [![Generic badge](https://img.shields.io/badge/Node.js->=24-3c873a?style=flat-square)](https://nodejs.org) [![Generic badge](https://img.shields.io/badge/TypeScript-5.9+-3178c6?style=flat-square)](https://www.typescriptlang.org) [![Generic badge](https://img.shields.io/badge/MCP_SDK-1.26+-ff6600?style=flat-square)](https://modelcontextprotocol.io) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](vscode:mcp/install?config=%7B%22name%22%3A%22cortex-mcp%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22cortex-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](vscode-insiders:mcp/install?config=%7B%22name%22%3A%22cortex-mcp%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22cortex-mcp%40latest%22%5D%7D) [![Install in Cursor](https://img.shields.io/badge/Cursor-Install-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvcnRleC1tY3BAbGF0ZXN0Il19)

Multi-level reasoning MCP server with configurable depth levels.

## Overview

Cortex MCP is a reasoning engine that exposes a `reasoning.think` tool to perform multi-step analysis on complex queries. It supports three configurable depth levels (Basic, Normal, High), maintains session state for follow-up questions, and offers asynchronous task execution for long-running reasoning processes. All reasoning happens locally in-memory.

## Key Features

- **Multi-Level Reasoning**: Three distinct depth levels (`basic`, `normal`, `high`) with varying token budgets and thought counts.
- **Session Continuity**: Resume reasoning sessions by ID to maintain context across multiple turns.
- **Async Task Support**: Execute long-running reasoning as a background task with progress notifications.
- **Event-Driven Architecture**: Internal event emitter orchestrates session lifecycle and resource updates.
- **Real-time Resources**: Inspect active sessions and individual thought traces via MCP resources.
- **Strict Validation**: Zod-based schemas ensure type safety for all inputs and outputs.

## Tech Stack

- **Runtime**: Node.js >= 24
- **Language**: TypeScript 5.9+
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.26.0
- **Validation**: `zod` ^4.3.6
- **Testing**: `node:test` (Native)
- **Package Manager**: npm

## Architecture

1. **Transport**: Receives JSON-RPC messages via `stdio`.
2. **Tool Handler**: `reasoning.think` validates input and initiates the reasoning planner.
3. **Engine**: The `reasoner` orchestrates thoughts based on the selected `level` configuration.
4. **State**: Sessions are stored in an in-memory `SessionStore` (LRU/TTL based).
5. **Resources**: Dynamic resource endpoints expose session data and markdown traces.

## Repository Structure

```
cortex-mcp/
├── src/
│   ├── index.ts              # CLI entry point (stdio transport)
│   ├── server.ts             # Server factory & setup
│   ├── engine/               # Reasoning logic and session store
│   ├── tools/                # Tool implementations (reasoning.think)
│   ├── resources/            # Resource endpoints
│   ├── prompts/              # Prompt templates
│   ├── schemas/              # Zod schemas (inputs/outputs)
│   └── lib/                  # Utilities and types
├── scripts/                  # Build and task runners
├── package.json
└── tsconfig.json
```

## Requirements

- **Node.js**: >= 24

## Quickstart

Use `npx` to run the server directly without installation:

```bash
npx -y cortex-mcp@latest
```

## Installation

### NPX (Recommended)

```bash
npx -y cortex-mcp@latest
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

### Environment Variables

No environment variables are strictly required for basic operation.

### Runtime Levels

The server is configured with the following reasoning levels (defined in `src/engine/config.ts`):

| Level    | Token Budget | Thoughts Range |
| :------- | :----------- | :------------- |
| `basic`  | 2,048        | 3–5            |
| `normal` | 8,192        | 6–10           |
| `high`   | 32,768       | 15–25          |

## Usage

Configure your MCP client to start the server via stdio.

### Stdio Transport

Run the server process directly. Messages are sent over `stdin` and `stdout`.

## MCP Surface

### Tools

#### `reasoning.think`

Perform multi-level reasoning on a query.

| Parameter        | Type   | Required | Default | Description                                                 |
| :--------------- | :----- | :------- | :------ | :---------------------------------------------------------- |
| `query`          | string | Yes      | -       | The question or problem to reason about (max 10,000 chars). |
| `level`          | enum   | Yes      | -       | Depth level: `basic`, `normal`, `high`.                     |
| `targetThoughts` | number | No       | -       | Optional exact step count (max 25).                         |
| `sessionId`      | string | No       | -       | Session ID to continue a previous reasoning session.        |

**Output Example**:

```json
{
  "ok": true,
  "result": {
    "sessionId": "uuid-v4...",
    "level": "normal",
    "thoughts": [{ "index": 0, "content": "...", "revision": 0 }],
    "generatedThoughts": 1,
    "totalThoughts": 1,
    "tokenBudget": 8192
  }
}
```

### Resources

| URI Pattern                                            | Description                                        | MIME Type          |
| :----------------------------------------------------- | :------------------------------------------------- | :----------------- |
| `internal://instructions`                              | Usage instructions for the MCP server.             | `text/markdown`    |
| `reasoning://sessions`                                 | List of active reasoning sessions.                 | `application/json` |
| `reasoning://sessions/{sessionId}`                     | Detailed view of a reasoning session.              | `application/json` |
| `file:///cortex/sessions/{sessionId}/trace.md`         | Full Markdown trace of a session.                  | `text/markdown`    |
| `file:///cortex/sessions/{sessionId}/{thoughtName}.md` | Content of a single thought (e.g. `Thought-1.md`). | `text/markdown`    |

### Prompts

| Name                 | Arguments                          | Description                                   |
| :------------------- | :--------------------------------- | :-------------------------------------------- |
| `reasoning.basic`    | `query`, `targetThoughts`          | Prepare a basic-depth reasoning request.      |
| `reasoning.normal`   | `query`, `targetThoughts`          | Prepare a normal-depth reasoning request.     |
| `reasoning.high`     | `query`, `targetThoughts`          | Prepare a high-depth reasoning request.       |
| `reasoning.retry`    | `query`, `level`, `targetThoughts` | Retry a failed task with modified parameters. |
| `reasoning.continue` | `sessionId`, `query`, `level`, ... | Continue an existing session.                 |
| `get-help`           | -                                  | Return server usage instructions.             |

### Tasks

This server supports **async task execution** for `reasoning.think`.

- **Capability**: `execution: { taskSupport: 'optional' }`
- **Usage**: Clients can invoke the tool as a background task.
- **Monitoring**: Progress is reported via `notifications/progress` (on 'high' level, typically every 2 steps).

## Client Configuration Examples

<details>
<summary><strong>VS Code</strong></summary>

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
<summary><strong>Claude Desktop</strong></summary>

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
<summary><strong>Cursor</strong></summary>

Add to your Cursor MCP settings:

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

- **Stdio Isolation**: The server writes all logs to `stderr` to avoid corrupting the JSON-RPC stream on `stdout`.
- **Input Validation**: All tool inputs conform to strict Zod schemas with character limits (`max(10000)` for queries).
- **Filesystem**: No actual filesystem writes occur; "files" are exposed virtually via resources.

## Development Workflow

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Scripts**:

| Script      | Command                        | Purpose                          |
| :---------- | :----------------------------- | :------------------------------- |
| `build`     | `node scripts/tasks.mjs build` | Clean, compile, and copy assets. |
| `dev`       | `tsc --watch ...`              | Watch mode compilation.          |
| `dev:run`   | `node --watch dist/index.js`   | Run server with auto-restart.    |
| `test`      | `node scripts/tasks.mjs test`  | Build and run tests.             |
| `lint`      | `eslint .`                     | Lint source files.               |
| `inspector` | `npm run build && ...`         | Launch MCP Inspector.            |

## Build and Release

The project uses a custom task runner (`scripts/tasks.mjs`) for build orchestration.

- **Build**: `npm run build` generates artifacts in `dist/`.
- **Publish**: `npm run prepublishOnly` ensures linting, type-checking, and building before publish.

## Troubleshooting

- **No output**: The server uses `stdio`. Ensure your client is capturing `stdout` correctly. Check `stderr` for logs.
- **Inspector**: Run `npm run inspector` to debug tools and resources interactively.
- **Session not found**: Sessions are in-memory and expire locally (default TTL: 30 minutes).

## License

MIT
