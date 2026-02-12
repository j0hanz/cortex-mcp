# Cortex MCP

<!-- mcp-name: io.github.j0hanz/cortex-mcp -->

[![npm version](https://img.shields.io/npm/v/@j0hanz/cortex-mcp?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@j0hanz/cortex-mcp) [![Release workflow](https://github.com/j0hanz/cortex-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/j0hanz/cortex-mcp/actions/workflows/release.yml) [![Node.js >=24](https://img.shields.io/badge/Node.js->=24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org) [![TypeScript 5.9+](https://img.shields.io/badge/TypeScript-5.9+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![MCP SDK 1.26+](https://img.shields.io/badge/MCP_SDK-1.26+-ff6600?style=flat-square)](https://modelcontextprotocol.io) [![License MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0=)

Multi-level reasoning MCP server with configurable depth levels.

Cortex MCP exposes a single `reasoning.think` tool over stdio, providing structured, multi-step reasoning with session continuity, resource views, and optional task execution for long-running runs.

## Key Features

- Multi-level reasoning (`basic`, `normal`, `high`) with configurable thought counts and token budgets.
- Optional task execution with progress notifications for long-running requests.
- Resource endpoints for session lists, session detail, and markdown traces.
- Prompt helpers for building correct tool calls.

## Requirements

- Node.js >= 24
- An MCP client that supports stdio servers

## Quick Start

Standard config (works in most MCP clients):

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/cortex-mcp@latest"]
    }
  }
}
```

> [!TIP]
> Use the standard config first, then add per-client configuration below if needed.

## Client Configuration

<details>
<summary><b>Install in VS Code</b></summary>

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D)

Add to your user `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "cortex-mcp": {
        "command": "npx",
        "args": ["-y", "@j0hanz/cortex-mcp@latest"]
      }
    }
  }
}
```

> [!NOTE]
> Missing info: official VS Code MCP docs URL is not referenced in this repo.

</details>

<details>
<summary><b>Install in VS Code Insiders</b></summary>

[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D&quality=insiders)

Add to your user `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "cortex-mcp": {
        "command": "npx",
        "args": ["-y", "@j0hanz/cortex-mcp@latest"]
      }
    }
  }
}
```

> [!NOTE]
> Missing info: official VS Code Insiders MCP docs URL is not referenced in this repo.

</details>

<details>
<summary><b>Install in Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0=)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/cortex-mcp@latest"]
    }
  }
}
```

> [!NOTE]
> Missing info: official Cursor MCP docs URL is not referenced in this repo.

</details>

<details>
<summary><b>Install in Claude Desktop</b></summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/cortex-mcp@latest"]
    }
  }
}
```

> [!NOTE]
> Missing info: official Claude Desktop MCP docs URL is not referenced in this repo.

</details>

## MCP Surface

### Tools

#### reasoning.think

Perform multi-step reasoning on a query with a selected depth level.

| Name           | Type   | Required | Default | Description                                                      |
| -------------- | ------ | -------- | ------- | ---------------------------------------------------------------- |
| query          | string | Yes      | -       | The question or problem to reason about (1-10,000 chars).        |
| level          | enum   | Yes      | -       | Reasoning depth level: `basic`, `normal`, `high`.                |
| targetThoughts | number | No       | -       | Optional explicit thought count within the selected level range. |
| sessionId      | string | No       | -       | Session ID to continue a previous reasoning session.             |

Returns a structured result with session metadata, thoughts, and token usage:

```json
{
  "ok": true,
  "result": {
    "sessionId": "8e2e2c7a-1234-4567-89ab-001122334455",
    "level": "normal",
    "status": "active",
    "thoughts": [{ "index": 0, "content": "Step 1/6: ...", "revision": 0 }],
    "generatedThoughts": 1,
    "requestedThoughts": 6,
    "totalThoughts": 6,
    "tokenBudget": 8192,
    "tokensUsed": 128,
    "ttlMs": 1800000,
    "expiresAt": 1739356800000,
    "createdAt": 1739356500000,
    "updatedAt": 1739356505000,
    "summary": "Session [8e2e2c7a-1234-4567-89ab-001122334455] at level [normal] with [1] thoughts."
  }
}
```

### Resources

| URI Pattern                                          | Description                                       | MIME Type        |
| ---------------------------------------------------- | ------------------------------------------------- | ---------------- |
| internal://instructions                              | Usage instructions for the MCP server.            | text/markdown    |
| reasoning://sessions                                 | List of active reasoning sessions with summaries. | application/json |
| reasoning://sessions/{sessionId}                     | Detailed view of a reasoning session.             | application/json |
| file:///cortex/sessions/{sessionId}/trace.md         | Markdown trace of a reasoning session.            | text/markdown    |
| file:///cortex/sessions/{sessionId}/{thoughtName}.md | Markdown content of a single thought.             | text/markdown    |

### Prompts

| Name               | Arguments                               | Description                                             |
| ------------------ | --------------------------------------- | ------------------------------------------------------- |
| reasoning.basic    | query, targetThoughts                   | Prepare a basic-depth reasoning request.                |
| reasoning.normal   | query, targetThoughts                   | Prepare a normal-depth reasoning request.               |
| reasoning.high     | query, targetThoughts                   | Prepare a high-depth reasoning request.                 |
| reasoning.retry    | query, level, targetThoughts            | Retry a failed reasoning task with modified parameters. |
| reasoning.continue | sessionId, query, level, targetThoughts | Continue an existing reasoning session.                 |
| get-help           | -                                       | Return server usage instructions.                       |

### Tasks

Task-augmented tool calls are supported for `reasoning.think` with `taskSupport: optional`.

- Call the tool as a task to receive a task id.
- Poll `tasks/get` and read results via `tasks/result`.
- Cancel with `tasks/cancel`.

## Configuration

### Runtime Modes

| Mode  | Description                   |
| ----- | ----------------------------- |
| stdio | The only supported transport. |

### Environment Variables

> [!NOTE]
> Missing info: no environment variables are documented in this repo.

## Development

Install dependencies:

```bash
npm install
```

Scripts:

| Script     | Command                                                                                       | Purpose                                 |
| ---------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| clean      | node scripts/tasks.mjs clean                                                                  | Remove build artifacts.                 |
| build      | node scripts/tasks.mjs build                                                                  | Build the server to dist/.              |
| dev        | tsc --watch --preserveWatchOutput                                                             | Watch and compile TypeScript.           |
| dev:run    | node --env-file=.env --watch dist/index.js                                                    | Run the built server with auto-restart. |
| format     | prettier --write .                                                                            | Format the codebase.                    |
| type-check | node scripts/tasks.mjs type-check                                                             | Run TypeScript type checks.             |
| lint       | eslint .                                                                                      | Lint the codebase.                      |
| test       | node scripts/tasks.mjs test                                                                   | Build and run tests.                    |
| inspector  | npm run build && npx -y @modelcontextprotocol/inspector node dist/index.js ${workspaceFolder} | Launch MCP Inspector.                   |

Debug with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Build and Release

The GitHub Actions workflow in `.github/workflows/release.yml` automates version bumps, testing, publishing to npm, MCP Registry, and Docker image publishing.

Docker support is included via the multi-stage `Dockerfile` and `docker-compose.yml`.

## Troubleshooting

- If your client shows no output, remember this is a stdio server and the JSON-RPC stream is on stdout.
- Use `npm run inspector` to explore tools, resources, and prompts.
- Sessions are in-memory and expire after 30 minutes of inactivity.

## License

MIT
