# cortex-mcp

Multi-level reasoning MCP server that performs structured step-by-step reasoning at configurable depth levels.

## Features

- **Three reasoning levels**: basic (3-5 steps), normal (6-10 steps), high (15-25 steps)
- **Session management**: Continue reasoning across multiple calls
- **Progress reporting**: Real-time progress notifications via MCP protocol
- **Structured output**: Both JSON text and structured content in responses

## Prerequisites

- Node.js >= 24
- npm

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Type Check

```bash
npm run type-check
```

## MCP Inspector

```bash
npm run inspector
```

Or manually:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cortex-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cortex-mcp/dist/index.js"]
    }
  }
}
```

### VS Code

Add to your VS Code MCP settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "cortex-mcp": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

## Tool API

### `reasoning.think`

Perform multi-step reasoning on a query.

#### Parameters

| Parameter   | Type                            | Required | Description                                             |
| ----------- | ------------------------------- | -------- | ------------------------------------------------------- |
| `query`     | `string`                        | Yes      | The question or problem to reason about (1-10000 chars) |
| `level`     | `"basic" \| "normal" \| "high"` | Yes      | Reasoning depth level                                   |
| `sessionId` | `string`                        | No       | Session ID to continue previous reasoning               |

#### Levels

| Level    | Thoughts | Token Budget |
| -------- | -------- | ------------ |
| `basic`  | 3-5      | ~2,048       |
| `normal` | 6-10     | ~8,192       |
| `high`   | 15-25    | ~32,768      |

#### Response Shape

```json
{
  "ok": true,
  "result": {
    "sessionId": "uuid",
    "level": "basic",
    "thoughts": [{ "index": 0, "content": "Step 1/5: ...", "revision": 0 }],
    "totalThoughts": 5,
    "tokenBudget": 2048,
    "tokensUsed": 256
  }
}
```

## Architecture

```text
src/
├── index.ts              # Entrypoint: shebang, stdio transport, shutdown
├── server.ts             # McpServer instance, capability declaration
├── tools/                # Tool implementations (one per file)
├── schemas/              # Zod input/output schemas
├── engine/               # Reasoning engine (sessions, thoughts, events)
└── lib/                  # Shared helpers (errors, responses, types)
```

## License

MIT
