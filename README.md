# Cortex MCP

[![npm version](https://img.shields.io/npm/v/@j0hanz/cortex-mcp?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@j0hanz/cortex-mcp) [![Release](https://github.com/j0hanz/cortex-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/j0hanz/cortex-mcp/actions/workflows/release.yml) [![Node.js >=24](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D&quality=insiders) [![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0=) [![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0=)

Multi-level reasoning MCP server with configurable depth levels. Designed for complex problem-solving that requires structured thought chains and session continuity across multiple tool calls.

## Key Features

- **Multi-level reasoning**: `basic` (3–5 thoughts), `normal` (6–10 thoughts), and `high` (15–25 thoughts).
- **Session Continuity**: Maintain context across multiple tool calls with session IDs.
- **Task Execution**: Supports long-running reasoning tasks with progress notifications.
- **Resource Views**: Inspect active sessions and detailed reasoning traces via MCP resources.
- **Completable Arguments**: Offers completions for session IDs, levels, and thought names.

## Requirements

- **Node.js**: >= 24 (see `package.json` engines)
- An MCP client that supports stdio servers.

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

## Client Configuration

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

</details>

<details>
<summary><b>Install in VS Code</b></summary>

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

</details>

<details>
<summary><b>Install in Cursor</b></summary>

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

</details>

## MCP Surface

### Tools

#### `reasoning_think`

Perform multi-step reasoning on a query with a selected depth level.

| Name             | Type         | Required | Default | Description                                                                   |
| :--------------- | :----------- | :------- | :------ | :---------------------------------------------------------------------------- |
| `query`          | string       | No       | -       | The question or problem to reason about (required for new sessions).          |
| `level`          | enum         | No       | -       | Reasoning depth level: `basic`, `normal`, `high` (required for new sessions). |
| `targetThoughts` | number       | No       | -       | Optional explicit thought count within the selected level range.              |
| `sessionId`      | string       | No       | -       | Session ID to continue a previous reasoning session.                          |
| `runMode`        | enum         | No       | `step`  | `step` appends one thought; `run_to_completion` consumes multiple thoughts.   |
| `thought`        | string/array | Yes      | -       | Your full reasoning content for this step (verbatim).                         |
| `thoughts`       | array        | No       | -       | (Deprecated) Additional thought inputs for `run_to_completion`.               |

**Returns:** A structured result with session metadata, thoughts, and token usage.

### Resources

| URI Pattern                                            | Description                            | MIME Type          |
| :----------------------------------------------------- | :------------------------------------- | :----------------- |
| `internal://instructions`                              | Usage instructions for the MCP server. | `text/markdown`    |
| `reasoning://sessions`                                 | List of active reasoning sessions.     | `application/json` |
| `reasoning://sessions/{sessionId}`                     | Detailed view of a reasoning session.  | `application/json` |
| `file:///cortex/sessions/{sessionId}/trace.md`         | Markdown trace of a reasoning session. | `text/markdown`    |
| `file:///cortex/sessions/{sessionId}/{thoughtName}.md` | Markdown content of a single thought.  | `text/markdown`    |

### Prompts

| Name                 | Arguments                                       | Description                               |
| :------------------- | :---------------------------------------------- | :---------------------------------------- |
| `reasoning.basic`    | `query`, `targetThoughts`                       | Prepare a basic-depth reasoning request.  |
| `reasoning.normal`   | `query`, `targetThoughts`                       | Prepare a normal-depth reasoning request. |
| `reasoning.high`     | `query`, `targetThoughts`                       | Prepare a high-depth reasoning request.   |
| `reasoning.retry`    | `query`, `level`, `targetThoughts`              | Retry a failed reasoning task.            |
| `reasoning.continue` | `sessionId`, `query`, `level`, `targetThoughts` | Continue an existing reasoning session.   |
| `get-help`           | -                                               | Return server usage instructions.         |

### Tasks

Task-augmented tool calls are supported for `reasoning_think`. Use `tools/call` with task support to run long-running reasoning sessions asynchronously.

## Configuration

### Environment Variables

| Variable                            | Description                                    | Default            |
| :---------------------------------- | :--------------------------------------------- | :----------------- |
| `CORTEX_SESSION_TTL_MS`             | Session time-to-live in milliseconds.          | `1800000` (30 min) |
| `CORTEX_MAX_SESSIONS`               | Maximum active in-memory sessions.             | `100`              |
| `CORTEX_MAX_TOTAL_TOKENS`           | Maximum aggregate token usage across sessions. | `500000`           |
| `CORTEX_MAX_ACTIVE_REASONING_TASKS` | Maximum concurrent background tasks.           | `32`               |

## Development

```bash
# Install dependencies
npm install

# Build the server
npm run build

# Run in development mode
npm run dev

# Run tests
npm run test

# Launch MCP Inspector
npm run inspector
```

## Build & Release

The project uses GitHub Actions for CI/CD:

- **Release**: Bumps version, validates, tags, and creates a GitHub release.
- **Publish npm**: Publishes the package to npm.
- **Publish MCP**: Publishes the server to the MCP Registry.
- **Publish Docker**: Builds and pushes the Docker image to `ghcr.io`.

## License

MIT
