# AGENTS.md

Multi-level reasoning MCP server with configurable depth levels. Designed for complex problem-solving that requires structured thought chains and session continuity across multiple tool calls.

## Tooling

- **Manager**: npm
- **Frameworks**: TypeScript ^5.9 (Node.js >= 24, ESM), @modelcontextprotocol/sdk ^1.27.1, zod ^4.3.6
- **Lint/format**: eslint ^10, prettier, knip

## Commands

- **Build**: `npm run build` — compiles TS to `dist/`
- **Dev**: `npm run dev` — `tsc --watch`
- **Test**: `npm run test` — node:test runner via `scripts/tasks.mjs`
- **Test (single file)**: `node --test --import tsx/esm <file>`
- **Lint**: `npm run lint` — ESLint flat config
- **Lint (single file)**: `eslint --fix <file>`
- **Type-check**: `npm run type-check` — checks src + tests
- **Format**: `npm run format` — Prettier
- **Deploy**: `npm run prepublishOnly` — lint + type-check + build
- **Inspector**: `npm run inspector` — MCP Inspector UI

## Safety Boundaries

- **Always**: `npm run lint`, `npm run type-check`, `npm run test`
- **Ask First**: installing or removing dependencies, deleting files or directories, running `npm run build` or `npm run test:coverage` (expensive), database/schema migrations, deploy or infrastructure changes, `git push` / force push
- **Never**: commit or expose secrets/credentials; edit files in `.git/`, `dist/`, or `node_modules/`; change production config without approval; trigger releases (`npm publish`, `gh release`) without approval

## Directory Overview

```text
.
├── .github/            # CI/workflows, instructions, agents, prompts
├── assets/             # Static assets (copied to dist/)
├── memory_db/          # SQLite memory database (runtime)
├── scripts/            # Build/test automation (tasks.mjs)
├── src/                # Application source
│   ├── __tests__/      # Tests (node:test)
│   ├── engine/         # Reasoning engine + session store
│   ├── lib/            # Shared utilities, diff parser, tool contracts
│   ├── prompts/        # MCP prompts
│   ├── resources/      # MCP resources (instructions, tool-info, etc.)
│   ├── schemas/        # Zod input/output schemas
│   ├── tools/          # MCP tool implementations
│   ├── index.ts        # Entry point
│   └── server.ts       # Server setup + registration
├── Dockerfile          # Container image
├── docker-compose.yml  # Local container orchestration
├── eslint.config.mjs   # ESLint flat config
├── server.json         # Published server metadata
├── tsconfig.json       # TypeScript config (source)
├── tsconfig.build.json # TypeScript config (build)
└── tsconfig.test.json  # TypeScript config (tests)
```

## Navigation

- **Entry Points**: `src/index.ts` -> `src/server.ts`
- **Key Configs**: `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`
- **Deeper docs**: `.github/instructions/typescript-mcp-server.instructions.md`
- **CI**: `.github/workflows/release.yml`

## Don'ts

- Don't bypass existing lint/type rules without approval.
- Don't ignore test failures in CI.
- Don't add third-party packages without checking existing manifests.
- Don't hardcode secrets or sensitive info in code, tests, docs, or config.
- Don't edit generated files (`dist/`, `*.tsbuildinfo`) directly.
- Don't trigger releases without approval.

## Change Checklist

1. Run `npm run lint` to fix lint errors.
2. Run `npm run type-check` to verify types.
3. Run `npm run test` to ensure tests pass.
4. Run `npm run format` to format code.
