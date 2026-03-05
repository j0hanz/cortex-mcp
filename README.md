# Cortex MCP

[![npm version](https://img.shields.io/npm/v/%40j0hanz%2Fcortex-mcp?style=flat-square&logo=npm)](https://www.npmjs.com/package/%40j0hanz%2Fcortex-mcp) [![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#contributing-and-license)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D&quality=insiders) [![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22cortex-mcp%22%3A%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D%7D)

[![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0%3D) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0%3D) [![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=%40j0hanz%2Fcortex-mcp%40latest&id=%40j0hanz%2Fcortex-mcp&name=cortex-mcp&description=cortex-mcp%20MCP%20server)

Multi-level reasoning MCP server with configurable depth levels, published as `@j0hanz/cortex-mcp`.

## Overview

Cortex MCP is a stdio-only MCP server for stateful, depth-controlled reasoning. The runtime entrypoint in `src/index.ts` connects `createServer()` to `StdioServerTransport`, and the server surface in `src/server.ts` enables tools, prompts, completions, logging, and subscribable resources around a single session-based reasoning engine.

The live MCP surface confirmed by Inspector is 1 tool, 6 concrete resources, 4 resource templates, and 7 prompts. Sessions are stored in memory, exposed as MCP resources, and cleared on process restart.

## Key Features

- `reasoning_think` supports step-by-step sessions, `run_to_completion` batches, rollback, early conclusion, and structured `observation` / `hypothesis` / `evaluation` input.
- Four depth levels are built into the engine: `basic`, `normal`, `high`, and `expert`, each with bounded thought ranges and token budgets.
- Prompt helpers expose `reasoning.basic`, `reasoning.normal`, `reasoning.high`, `reasoning.expert`, `reasoning.continue`, `reasoning.retry`, and `get-help`.
- Resource endpoints expose internal docs plus live session lists, per-session JSON views, full markdown traces, and individual thought documents.
- Completions are wired for levels, session IDs, and thought names through `completable()` and resource-template completion hooks.

## Requirements

- Node.js `>=24` for local `npx` or `npm` usage.
- An MCP client that supports `stdio` transport.
- Optional: Docker if you want to build or run the container image defined by `Dockerfile`.

## Quick Start

Use this standard MCP client configuration:

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

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D&quality=insiders) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0%3D) [![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22cortex-mcp%22%3A%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D%7D) [![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=%40j0hanz%2Fcortex-mcp%40latest&id=%40j0hanz%2Fcortex-mcp&name=cortex-mcp&description=Multi-level%20reasoning%20MCP%20server%20with%20configurable%20depth%20levels) [![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0%3D)

<details>
<summary><b>Install in VS Code</b></summary>

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/cortex-mcp@latest"]
    }
  }
}
```

Or install via CLI:

```sh
code --add-mcp '{"name":"cortex-mcp","command":"npx","args":["-y","@j0hanz/cortex-mcp@latest"]}'
```

For more info, see [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).

</details>

<details>
<summary><b>Install in VS Code Insiders</b></summary>

[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cortex-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D&quality=insiders)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/cortex-mcp@latest"]
    }
  }
}
```

Or install via CLI:

```sh
code-insiders --add-mcp '{"name":"cortex-mcp","command":"npx","args":["-y","@j0hanz/cortex-mcp@latest"]}'
```

For more info, see [VS Code Insiders MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).

</details>

<details>
<summary><b>Install in Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0%3D)

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

For more info, see [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol).

</details>

<details>
<summary><b>Install in Visual Studio</b></summary>

[![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22cortex-mcp%22%3A%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcortex-mcp%40latest%22%5D%7D%7D)

Add to `mcp.json (VS integrated)`:

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

For more info, see [Visual Studio MCP docs](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers).

</details>

<details>
<summary><b>Install in Goose</b></summary>

[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=%40j0hanz%2Fcortex-mcp%40latest&id=%40j0hanz%2Fcortex-mcp&name=cortex-mcp&description=Multi-level%20reasoning%20MCP%20server%20with%20configurable%20depth%20levels)

Add to `Goose extension registry`:

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

For more info, see [Goose MCP docs](https://block.github.io/goose/docs/getting-started/using-extensions).

</details>

<details>
<summary><b>Install in LM Studio</b></summary>

[![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=cortex-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29ydGV4LW1jcEBsYXRlc3QiXX0%3D)

Add to `LM Studio MCP config`:

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

For more info, see [LM Studio MCP docs](https://lmstudio.ai/docs/basics/mcp).

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

For more info, see [Claude Desktop MCP docs](https://modelcontextprotocol.io/quickstart/user).

</details>

<details>
<summary><b>Install in Claude Code</b></summary>

Add to `Claude Code CLI`:

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

Or install via CLI:

```sh
claude mcp add cortex-mcp -- npx -y @j0hanz/cortex-mcp@latest
```

For more info, see [Claude Code MCP docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials#set-up-model-context-protocol-mcp).

</details>

<details>
<summary><b>Install in Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

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

For more info, see [Windsurf MCP docs](https://docs.windsurf.com/windsurf/mcp).

</details>

<details>
<summary><b>Install in Amp</b></summary>

Add to `Amp MCP config`:

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

Or install via CLI:

```sh
amp mcp add cortex-mcp -- npx -y @j0hanz/cortex-mcp@latest
```

For more info, see [Amp MCP docs](https://docs.amp.dev).

</details>

<details>
<summary><b>Install in Cline</b></summary>

Add to `cline_mcp_settings.json`:

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

For more info, see [Cline MCP docs](https://docs.cline.bot/mcp-servers/configuring-mcp-servers).

</details>

<details>
<summary><b>Install in Codex CLI</b></summary>

Add to `~/.codex/config.yaml or codex CLI`:

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

For more info, see [Codex CLI MCP docs](https://github.com/openai/codex).

</details>

<details>
<summary><b>Install in GitHub Copilot</b></summary>

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "cortex-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/cortex-mcp@latest"]
    }
  }
}
```

For more info, see [GitHub Copilot MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).

</details>

<details>
<summary><b>Install in Warp</b></summary>

Add to `Warp MCP config`:

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

For more info, see [Warp MCP docs](https://docs.warp.dev/features/mcp-model-context-protocol).

</details>

<details>
<summary><b>Install in Kiro</b></summary>

Add to `.kiro/settings/mcp.json`:

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

For more info, see [Kiro MCP docs](https://kiro.dev/docs/mcp/overview/).

</details>

<details>
<summary><b>Install in Gemini CLI</b></summary>

Add to `~/.gemini/settings.json`:

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

For more info, see [Gemini CLI MCP docs](https://github.com/google-gemini/gemini-cli).

</details>

<details>
<summary><b>Install in Zed</b></summary>

Add to `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "cortex-mcp": {
      "settings": {
        "command": "npx",
        "args": ["-y", "@j0hanz/cortex-mcp@latest"]
      }
    }
  }
}
```

For more info, see [Zed MCP docs](https://zed.dev/docs/assistant/model-context-protocol).

</details>

<details>
<summary><b>Install in Augment</b></summary>

Add to `VS Code settings.json`:

> Add to your VS Code `settings.json` under `augment.advanced`.

```json
{
  "augment.advanced": {
    "mcpServers": [
      {
        "id": "cortex-mcp",
        "command": "npx",
        "args": ["-y", "@j0hanz/cortex-mcp@latest"]
      }
    ]
  }
}
```

For more info, see [Augment MCP docs](https://docs.augmentcode.com/setup-mcp-servers).

</details>

<details>
<summary><b>Install in Roo Code</b></summary>

Add to `Roo Code MCP settings`:

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

For more info, see [Roo Code MCP docs](https://docs.roocode.com/features/mcp/using-mcp-in-roo).

</details>

<details>
<summary><b>Install in Kilo Code</b></summary>

Add to `Kilo Code MCP settings`:

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

For more info, see [Kilo Code MCP docs](https://kilocode.ai/docs/features/mcp/using-mcp-servers).

</details>

## Use Cases

### Start bounded reasoning at the right depth

Use `reasoning.basic`, `reasoning.normal`, `reasoning.high`, or `reasoning.expert` when the client wants a prompt-first entrypoint, or call `reasoning_think` directly with `query`, `level`, and the first `thought`. Each response returns the current session state plus a `summary` string that tells the client how to continue.

Relevant tool: `reasoning_think`  
Related prompts: `reasoning.basic`, `reasoning.normal`, `reasoning.high`, `reasoning.expert`

### Continue, retry, or batch an active session

Reuse `sessionId` to continue a prior trace, switch to `runMode="run_to_completion"` when you already have the remaining thought inputs, or use the continuation and retry prompts to generate the next call payload. The handler also supports `rollbackToStep` and `isConclusion` for revising or ending a trace early.

Relevant tool: `reasoning_think`  
Related prompts: `reasoning.continue`, `reasoning.retry`

### Inspect live traces without re-running the tool

Read `reasoning://sessions` for the active session list, `reasoning://sessions/{sessionId}` for the JSON detail view, `reasoning://sessions/{sessionId}/trace` for the markdown transcript, or `reasoning://sessions/{sessionId}/thoughts/{thoughtName}` for a single thought. This lets a client present progress or audit a session independently from the next tool call.

Relevant resources: `reasoning://sessions`, `reasoning://sessions/{sessionId}`, `reasoning://sessions/{sessionId}/trace`, `reasoning://sessions/{sessionId}/thoughts/{thoughtName}`

## Architecture

```text
[MCP Client]
    |
    | stdio
    v
[src/index.ts]
    createServer()
    -> new StdioServerTransport()
    -> server.connect(transport)
    |
    v
[src/server.ts]
    McpServer("cortex-mcp")
    capabilities:
      - tools
      - prompts
      - completions
      - logging
      - resources { subscribe: true, listChanged: true }
    |
    +--> tools/call
    |     -> reasoning_think
    |     -> src/tools/reasoning-think.ts
    |     -> ReasoningThinkInputSchema / ReasoningThinkToolOutputSchema
    |     -> src/engine/reasoner.ts
    |     -> SessionStore
    |
    +--> prompts/get
    |     -> src/prompts/index.ts
    |
    +--> resources/read
    |     -> src/resources/index.ts
    |     -> internal://* and reasoning://sessions/*
    |
    +--> notifications
          -> logging messages
          -> resources/list_changed
          -> resources/updated
          -> notifications/progress
```

### Request Lifecycle

```text
[Client] -- initialize --> [Server]
[Server] -- serverInfo + capabilities --> [Client]
[Client] -- notifications/initialized --> [Server]
[Client] -- tools/call {name: "reasoning_think", arguments} --> [Handler]
[Handler] -- validate args --> [Reasoner + SessionStore]
[Reasoner] -- progress/resource events --> [Server notifications]
[Handler] -- structuredContent + optional trace resource --> [Client]
```

## MCP Surface

### Tools

#### `reasoning_think`

Stateful reasoning tool for creating and continuing multi-step sessions. It supports one-step interactive calls, `run_to_completion` batches, structured observation/hypothesis/evaluation input, rollback, and early conclusion while returning structured session state.

| Parameter        | Type      | Required | Description                                                                                                                                                             |
| ---------------- | --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`          | `string`  | no       | Question or problem to analyze.                                                                                                                                         |
| `level`          | `string`  | no       | Depth level. Required for new sessions. basic (1–3 steps, 2K budget), normal (4–8 steps, 8K budget), high (10–15 steps, 32K budget), expert (20–25 steps, 128K budget). |
| `targetThoughts` | `integer` | no       | Exact step count. Must fit level range.                                                                                                                                 |
| `sessionId`      | `string`  | no       | Session ID to continue.                                                                                                                                                 |
| `runMode`        | `string`  | no       | "step" (default) or "run_to_completion".                                                                                                                                |
| `thought`        | `any`     | no       | Reasoning text. Stored verbatim. String for step mode, string[] for batch.                                                                                              |
| `isConclusion`   | `boolean` | no       | End session early at final answer.                                                                                                                                      |
| `rollbackToStep` | `integer` | no       | 0-based index to rollback to. Discards later thoughts.                                                                                                                  |
| `stepSummary`    | `string`  | no       | One-sentence step summary.                                                                                                                                              |
| `observation`    | `string`  | no       | Known facts at this step.                                                                                                                                               |
| `hypothesis`     | `string`  | no       | Proposed next idea.                                                                                                                                                     |
| `evaluation`     | `string`  | no       | Critique of hypothesis.                                                                                                                                                 |

<details>
<summary>Data Flow</summary>

```text
1. [Client] -- tools/call {name: "reasoning_think", arguments} --> [Server]
   Transport: stdio
2. [Server] -- dispatch("reasoning_think") --> [Handler: src/tools/reasoning-think.ts]
3. [Handler] -- validate(ReasoningThinkInputSchema) --> [src/engine/reasoner.ts]
4. [Reasoner] -- create/update session --> [src/engine/session-store.ts]
5. [Handler] -- structuredContent + optional embedded trace resource --> [Client]
```

</details>

### Resources

| Resource                    | URI or Template                                           | MIME Type          | Description                                                                                  |
| --------------------------- | --------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `server-instructions`       | `internal://instructions`                                 | `text/markdown`    | Usage instructions for the MCP server.                                                       |
| `server-config`             | `internal://server-config`                                | `application/json` | Runtime limits and level configurations for the reasoning server.                            |
| `tool-catalog`              | `internal://tool-catalog`                                 | `text/markdown`    | Tool reference: models, params, outputs, data flow.                                          |
| `tool-info`                 | `internal://tool-info/{toolName}`                         | `text/markdown`    | Per-tool contract details.                                                                   |
| `tool-info-reasoning_think` | `internal://tool-info/reasoning_think`                    | `text/markdown`    | Contract details for `reasoning_think`.                                                      |
| `workflows`                 | `internal://workflows`                                    | `text/markdown`    | Recommended workflows and tool sequences.                                                    |
| `reasoning.sessions`        | `reasoning://sessions`                                    | application/json   | List of active reasoning sessions with summaries. Updated in real-time as sessions progress. |
| `reasoning.session`         | `reasoning://sessions/{sessionId}`                        | `application/json` | Detailed view of a single reasoning session, including all thoughts and metadata.            |
| `reasoning.trace`           | `reasoning://sessions/{sessionId}/trace`                  | `text/markdown`    | Markdown trace of a reasoning session (full content).                                        |
| `reasoning.thought`         | `reasoning://sessions/{sessionId}/thoughts/{thoughtName}` | `text/markdown`    | Markdown content of a single thought (for example `Thought-1`).                              |

### Prompts

| Prompt               | Arguments                                                     | Description                                             |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `get-help`           | none                                                          | Return server usage instructions.                       |
| `reasoning.basic`    | `query` required, `targetThoughts` optional                   | Basic-depth reasoning (1-3 thoughts).                   |
| `reasoning.normal`   | `query` required, `targetThoughts` optional                   | Normal-depth reasoning (4-8 thoughts).                  |
| `reasoning.high`     | `query` required, `targetThoughts` optional                   | High-depth reasoning (10-15 thoughts).                  |
| `reasoning.expert`   | `query` required, `targetThoughts` optional                   | Expert-depth reasoning (20-25 thoughts).                |
| `reasoning.continue` | `sessionId` required, `query` optional, `level` optional      | Continue an existing session. Optional follow-up query. |
| `reasoning.retry`    | `query` required, `level` required, `targetThoughts` optional | Retry a failed reasoning task with modified parameters. |

## MCP Capabilities

| Capability               | Status    | Evidence                                                                      |
| ------------------------ | --------- | ----------------------------------------------------------------------------- |
| `tools`                  | confirmed | `src/server.ts:203-205`, `src/tools/reasoning-think.ts:479`                   |
| `prompts`                | confirmed | `src/server.ts:205`, `src/prompts/index.ts:201`                               |
| `completions`            | confirmed | `src/server.ts:207`, `src/prompts/index.ts:249`, `src/resources/index.ts:375` |
| `logging`                | confirmed | `src/server.ts:204`, `src/server.ts:98`                                       |
| `resources.subscribe`    | confirmed | `src/server.ts:208`, `src/server.ts:121`                                      |
| `resources.listChanged`  | confirmed | `src/server.ts:208`, `src/server.ts:114`                                      |
| `progress notifications` | confirmed | `src/lib/mcp.ts:71`, `src/tools/reasoning-think.ts:424`                       |

### Tool Annotations

| Annotation        | Value   | Evidence                           |
| ----------------- | ------- | ---------------------------------- |
| `readOnlyHint`    | `false` | `src/tools/reasoning-think.ts:500` |
| `destructiveHint` | `false` | `src/tools/reasoning-think.ts:502` |
| `openWorldHint`   | `false` | `src/tools/reasoning-think.ts:503` |
| `idempotentHint`  | `false` | `src/tools/reasoning-think.ts:501` |

### Structured Output

- `reasoning_think` declares `outputSchema` and returns `structuredContent`, with an embedded trace resource when the trace is small enough. Evidence: `src/tools/reasoning-think.ts:498`, `src/lib/mcp.ts:97-114`.

## Configuration

| Variable                            | Default                | Required | Evidence                                                      |
| ----------------------------------- | ---------------------- | -------- | ------------------------------------------------------------- |
| `CORTEX_SESSION_TTL_MS`             | `1800000` (30 minutes) | no       | `src/engine/reasoner.ts:22`, `src/engine/session-store.ts:19` |
| `CORTEX_MAX_SESSIONS`               | `100`                  | no       | `src/engine/reasoner.ts:23`, `src/engine/session-store.ts:20` |
| `CORTEX_MAX_TOTAL_TOKENS`           | `2000000`              | no       | `src/engine/reasoner.ts:24`, `src/engine/session-store.ts:21` |
| `CORTEX_MAX_ACTIVE_REASONING_TASKS` | `32`                   | no       | `src/engine/config.ts:41-44`                                  |
| `CORTEX_REDACT_TRACE_CONTENT`       | `false`                | no       | `src/engine/config.ts:21`                                     |

> [!NOTE]
> The source does not define any HTTP host/port configuration. The only other environment-related signal is `NODE_ENV=production` in the Docker image and `--env-file=.env` in the local `dev:run` script.

## Security

| Control                      | Status    | Evidence                                                                            |
| ---------------------------- | --------- | ----------------------------------------------------------------------------------- |
| input validation             | confirmed | `src/schemas/inputs.ts:13`, `src/schemas/outputs.ts:46`, `src/prompts/index.ts:207` |
| stdout-safe logging fallback | confirmed | `src/server.ts:98`, `src/server.ts:145`                                             |
| main-thread-only runtime     | confirmed | `src/index.ts:15-25`                                                                |
| non-root container user      | confirmed | `Dockerfile:37`                                                                     |

> [!NOTE]
> No auth, OAuth, HTTP origin checks, or rate-limiting controls are implemented in the current source because the server only exposes stdio transport.

## Development

| Script           | Command                                                                           | Purpose                                                                            |
| ---------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `dev`            | `tsc --watch --preserveWatchOutput`                                               | Watch and compile source during development.                                       |
| `dev:run`        | `node --env-file=.env --watch dist/index.js`                                      | Run the built server in watch mode with an optional local `.env` file.             |
| `build`          | `node scripts/tasks.mjs build`                                                    | Clean `dist`, compile TypeScript, copy assets, and make the entrypoint executable. |
| `lint`           | `eslint .`                                                                        | Run ESLint across the repository.                                                  |
| `type-check`     | `node scripts/tasks.mjs type-check`                                               | Run source and test TypeScript checks concurrently.                                |
| `test`           | `node scripts/tasks.mjs test`                                                     | Run the TypeScript test suites with the configured loader.                         |
| `test:dist`      | `node scripts/tasks.mjs test:dist`                                                | Rebuild first, then run tests against the built output.                            |
| `test:fast`      | `node --test --import tsx/esm src/__tests__/**/*.test.ts node-tests/**/*.test.ts` | Run the fast direct test command without the task wrapper.                         |
| `format`         | `prettier --write .`                                                              | Format the repository.                                                             |
| `inspector`      | `npm run build && npx -y @modelcontextprotocol/inspector node dist/index.js`      | Build the server and open it in the MCP Inspector.                                 |
| `prepublishOnly` | `npm run lint && npm run type-check && npm run build`                             | Enforce release checks before publishing.                                          |

Additional helper scripts for diagnostics, coverage, asset copying, and `knip` are defined in `package.json`.

## Build and Release

- `.github/workflows/release.yml` bumps `package.json` and `server.json`, then runs `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` before tagging and creating a GitHub release.
- The same workflow publishes the package to npm with Trusted Publishing, publishes to the MCP Registry with `mcp-publisher`, and pushes a multi-arch Docker image to `ghcr.io`.
- `Dockerfile` uses a multi-stage Node 24 Alpine build, prunes dev dependencies, and runs the released container as the `mcp` user.

## Troubleshooting

- Sessions are in memory and expire after 30 minutes by default. If you receive `E_SESSION_NOT_FOUND`, start a new session or increase `CORTEX_SESSION_TTL_MS`.
- `runMode="run_to_completion"` requires enough `thought` entries to cover the remaining steps. If you want the server to return after each step, keep the default `step` mode.
- For stdio transport, do not add custom stdout logging around the server process. This server routes logs through MCP logging and falls back to `stderr` on failures.

## Credits

| Dependency                                                                           | Registry |
| ------------------------------------------------------------------------------------ | -------- |
| [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | npm      |
| [zod](https://www.npmjs.com/package/zod)                                             | npm      |

## Contributing and License

- License: MIT
- Contributions are welcome via pull requests.
