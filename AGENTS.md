# AGENTS.md

Multi-level reasoning MCP server with configurable depth levels. Designed for complex problem-solving that requires structured thought chains and session continuity across multiple tool calls.

## Tooling

- **Manager**: npm
- **Frameworks**: typescript, eslint, @modelcontextprotocol/sdk, @modelcontextprotocol/sdk, @trivago/prettier-plugin-sort-imports, eslint, eslint-config-prettier, eslint-plugin-de-morgan

## Architecture

- **Runtime entrypoint**: `src/index.ts` runs the server on stdio transport, enforces main-thread execution, and handles graceful shutdown on `SIGINT`/`SIGTERM`.
- **Server composition**: `src/server.ts` builds the `McpServer` with tools, prompts, resources, completions, logging, and task capabilities backed by `InMemoryTaskStore`.
- **Tool layer**: `src/tools/reasoning-think.ts` is the primary execution path and includes task creation, cancellation propagation, progress updates, concurrency limiting, and structured error responses.
- **Engine layer**: `src/engine/reasoner.ts` orchestrates step execution with per-session locks; `src/engine/session-store.ts` provides in-memory session lifecycle (TTL cleanup, max-session eviction, token-aware eviction, rollback/revision).
- **Contracts layer**: strict Zod schemas in `src/schemas/inputs.ts` and `src/schemas/outputs.ts` define request/response validation for `reasoning_think`.
- **Prompt/resource layer**: `src/prompts/` and `src/resources/` expose guided prompt templates, session resources (`reasoning://sessions/*`), and internal documentation resources (`internal://*`).

## Testing Strategy

- **Test harness**: `npm run test` executes `scripts/tasks.mjs test`, which builds first and then runs Node's native test runner (`node --test`) with TypeScript loader support.
- **Test location**: main coverage is in `src/__tests__/` with 10 `.test.ts` files.
- **Unit coverage**: core logic is tested directly (heuristics, validators, formatting, errors, concurrency limiter, and session-store state transitions including rollback, revision, eviction, and TTL sweep).
- **Integration coverage**: MCP behavior is validated via in-memory client/server tests using `@modelcontextprotocol/sdk` `Client` + `InMemoryTransport` for tools, prompts, completions, and resources.
- **Schema coverage**: `ReasoningThinkInputSchema` tests enforce required argument combinations, `runMode` rules, thought count bounds per level, and strict unknown-key rejection.
- **Type-checking split**: `npm run type-check` validates source and tests separately via `tsconfig.json` and `tsconfig.test.json` with `noEmit`.
- **Release gating**: `.github/workflows/release.yml` requires `lint`, `type-check`, `test`, and `build` before tagging and publish jobs run.

## Commands

- **Dev**: `npm run dev`
- **Test**: `npm run test`
- **Lint**: `npm run lint`
- **Deploy**: `npm run prepublishOnly`

## Safety Boundaries

- **Always**: `npm run lint`, `npm run type-check`, `npm run test`
- **Ask First**: `installing dependencies`, `deleting files`, `running full builds or e2e suites`, `database/schema migrations`, `deploy or infrastructure changes`, `git push / force push`, `npm run build`, `npm run test:coverage`, `npm run prepublishOnly`, `git push origin master --follow-tags`, `gh release create "v$VERSION" --title "v$VERSION" --generate-notes`, `npm publish --access public --provenance --ignore-scripts`
- **Never**: Never read or exfiltrate secrets or credentials.; Never edit generated files like `.git` manually.; commit or expose secrets/credentials; edit vendor/generated directories; change production config without approval

## Directory Overview

```text
.
├── .github/            # CI/workflows and repo automation
├── .vscode/
├── assets/             # static assets
├── memory_db/
├── scripts/            # automation scripts
├── src/                # application source
├── .prettierignore     # formatter config
├── .prettierrc         # formatter config
├── docker-compose.yml  # local container orchestration
├── Dockerfile          # container image build
├── eslint.config.mjs   # lint config
├── package.json        # scripts and dependencies
├── README.md           # usage and setup docs
├── server.json         # published server metadata
├── tsconfig.build.json # TypeScript config
└── tsconfig.json       # TypeScript config
└── ...                # 1 more top-level items omitted
```

## Navigation

- **Entry Points**: `package.json`, `README.md`, `src/index.ts`, `src/server.ts`, `docker-compose.yml`
- **Key Configs**: `.prettierrc`, `tsconfig.json`

## Don'ts

- Don't bypass existing lint/type rules without approval.
- Don't ignore test failures in CI.
- Don't use unapproved third-party packages without checking package manager manifests.
- Don't hardcode secrets or sensitive info in code, tests, docs, or config.
- Don't edit generated files directly.
- Don't trigger releases without approval.

## Change Checklist

1. Run `npm run lint` to fix lint errors.
2. Run `npm run type-check` to verify types.
3. Run `npm run test` to ensure tests pass.
4. Run `npm run format` to format code.
