# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Multi-level reasoning MCP server that exposes a `reasoning_think` tool over stdio transport with configurable depth levels (`basic`, `normal`, `high`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ (see `package.json` `devDependencies`, `tsconfig.json` `strict: true`)
  - **Frameworks:** `@modelcontextprotocol/sdk` ^1.26.0 — MCP protocol server SDK (see `package.json` `dependencies`)
  - **Key Libraries:**
    - `zod` ^4.3.6 — schema validation (see `package.json` `dependencies`)
    - `tsx` ^4.19.0 — TypeScript test loader for `node:test` (see `package.json` `devDependencies`)
    - `typescript-eslint` ^8.54.0 + `@eslint/js` ^9.23.2 — linting (see `package.json` `devDependencies`)
    - `prettier` ^3.8.1 + `@trivago/prettier-plugin-sort-imports` — formatting with import ordering (see `package.json` `devDependencies`, `.prettierrc`)
    - `knip` ^5.83.1 — unused dependency/export detection (see `package.json` `devDependencies`)
- **Architecture:** Single-tool MCP server with engine/schema/lib/tools layering. Session-based in-memory reasoning with `AsyncLocalStorage` context, `EventEmitter` lifecycle events, and per-request abort signal support. stdio transport only (see `src/index.ts`, `src/server.ts`).

## 2) Repository Map (High-Level)

- `src/index.ts`: CLI entrypoint — shebang, stdio transport wiring, SIGTERM/SIGINT shutdown handlers
- `src/server.ts`: `McpServer` instance creation, capability declaration, tool/prompt/resource registration, resource subscription support
- `src/tools/`: Tool implementations — one file per tool; `index.ts` barrel exports `registerAllTools()`
- `src/tools/reasoning-think.ts`: Core `reasoning_think` tool with task support and progress reporting
- `src/engine/`: Reasoning engine — session store, level configs, `AsyncLocalStorage` context, `EventEmitter` events, `reason()` function
- `src/schemas/`: Zod v4 input/output schemas (`z.strictObject()` for all object shapes)
- `src/lib/`: Shared helpers — `getErrorMessage()`, `createToolResponse()`, `createErrorResponse()`, shared types
- `src/prompts/`: MCP prompt registrations (per-level reasoning prompts, `get-help`, `reasoning.continue`)
- `src/resources/`: MCP resource registrations (server instructions, session listing, session detail template)
- `src/__tests__/`: Unit tests using `node:test` (see test files under `src/__tests__/`)
- `scripts/tasks.mjs`: Build/test task runner — clean, compile, copy assets, type-check, test orchestration (see `scripts/tasks.mjs`)
- `assets/`: Static assets copied to `dist/assets` during build (see `scripts/tasks.mjs` `BuildTasks.assets`)
- `.github/`: Instruction files and prompts (gitignored except `workflows/`)
- `.agents/skills/`: Codex/OpenAI agent skills for task-specific capabilities (auto-discovered at repo root)

> Ignore: `dist/`, `node_modules/`, `coverage/`, `.tsbuildinfo`, `.cache/`

## 3) Operational Commands (Verified)

- **Environment:** Node.js >=24 (see `package.json` `engines`); ESM (`"type": "module"` in `package.json`)
- **Install:** `npm install` (lockfile: `package-lock.json`)
- **Dev:** `npm run dev` — `tsc --watch --preserveWatchOutput` (see `package.json` `scripts.dev`)
- **Dev run:** `npm run dev:run` — `node --env-file=.env --watch dist/index.js` (see `package.json` `scripts.dev:run`)
- **Test:** `npm test` — runs `node scripts/tasks.mjs test` which validates `src/instructions.md` and compiles TypeScript (`tsc -p tsconfig.build.json`) before executing `node --test --import tsx/esm src/__tests__/**/*.test.ts` (see `scripts/tasks.mjs` `TestTasks.test`, `Pipeline.testBuild`)
- **Test (fast):** `npm run test:fast` — runs tests without building first (see `package.json` `scripts.test:fast`)
- **Test (coverage):** `npm run test:coverage` — runs `node scripts/tasks.mjs test --coverage` with `--experimental-test-coverage` (see `package.json` `scripts.test:coverage`)
- **Build:** `npm run build` — runs `node scripts/tasks.mjs build` which: cleans `dist/`, compiles TypeScript via `tsc -p tsconfig.build.json`, validates `src/instructions.md` exists, copies assets, sets executable permission (see `scripts/tasks.mjs` `Pipeline.fullBuild`)
- **Type-check:** `npm run type-check` — runs `tsc --noEmit` against `tsconfig.json` (see `scripts/tasks.mjs` `TestTasks.typeCheck`)
- **Lint:** `npm run lint` — `eslint .` (see `package.json` `scripts.lint`)
- **Lint fix:** `npm run lint:fix` — `eslint . --fix` (see `package.json` `scripts.lint:fix`)
- **Format:** `npm run format` — `prettier --write .` (see `package.json` `scripts.format`)
- **Inspector:** `npm run inspector` — builds then runs `npx @modelcontextprotocol/inspector node dist/index.js` (see `package.json` `scripts.inspector`)
- **Unused exports:** `npm run knip` / `npm run knip:fix` (see `package.json` `scripts.knip`)
- **Clean:** `npm run clean` — removes `dist/` and `.tsbuildinfo` files (see `scripts/tasks.mjs` `BuildTasks.clean`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase for variables/functions, PascalCase for types/classes/enums, UPPER_CASE for constants. Enforced by `@typescript-eslint/naming-convention` (see `eslint.config.mjs`).
- **Structure:** Business logic in `src/engine/`; tool handlers in `src/tools/`; Zod schemas in `src/schemas/`; shared helpers in `src/lib/`. One tool per file (see `typescript-mcp-server.instructions.md`).
- **Typing/Strictness:** `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `exactOptionalPropertyTypes: true`, `noImplicitReturns: true` (see `tsconfig.json`).
- **Imports:** Named exports only (no default exports). `import type` for type-only imports enforced by `@typescript-eslint/consistent-type-imports`. `.js` extensions required in local imports (NodeNext resolution). Import order enforced by `@trivago/prettier-plugin-sort-imports` with grouping: node builtins → third-party → `@modelcontextprotocol` → engine → schemas → lib → tools → prompts → resources → relative (see `.prettierrc`).
- **Explicit return types:** Required on exported functions — enforced by `@typescript-eslint/explicit-function-return-type` set to `error` (see `eslint.config.mjs`).
- **Patterns Observed:**
  - All Zod schemas use `z.strictObject()` with `.describe()` on every parameter and `.min()`/`.max()` bounds (observed in `src/schemas/inputs.ts`, `src/schemas/outputs.ts`)
  - Tool responses always include both `content` (JSON string) and `structuredContent` (object); errors use `isError: true` (observed in `src/lib/errors.ts`, `src/lib/tool-response.ts`)
  - Error handling returns tool execution errors (not protocol errors); `getErrorMessage()` safely extracts messages from unknown types (observed in `src/lib/errors.ts`)
  - `AsyncLocalStorage` for per-request context propagation (observed in `src/engine/context.ts`)
  - Typed `EventEmitter` for engine lifecycle events with `captureRejections: true` and error handler to prevent uncaught crashes (observed in `src/engine/events.ts`)
  - Session store uses in-memory `Map` with periodic sweep for TTL eviction via `setInterval().unref()` (observed in `src/engine/session-store.ts`)
  - Canonical tool registration pattern with `inputSchema`, `outputSchema`, `annotations`, `title`, `description` (observed in `src/tools/reasoning-think.ts`)
  - No `console.log` — only `console.error` for fatal errors; logging goes through MCP `sendLoggingMessage` (observed in `src/index.ts`, `src/tools/reasoning-think.ts`)
  - Shebang `#!/usr/bin/env node` as the first line of entrypoint (observed in `src/index.ts`)

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and `package-lock.json` via `npm install`. (see `package-lock.json`)
- Do not edit `package-lock.json` manually. (see `package-lock.json`)
- Do not commit secrets; never print `.env` values; use environment variables only for credentials. (see `.gitignore` which ignores `.env*`)
- Do not write to **stdout** in non-MCP output — it corrupts JSON-RPC over stdio. Use `console.error()` or protocol logging only. (see `typescript-mcp-server.instructions.md` stdio hygiene rules)
- Do not use `eval()` or `new Function()`. (see `cortex-mcp.instructions.md` SEC-002)
- Do not use default exports; use named exports only. (see `typescript-mcp-server.instructions.md`)
- Do not omit `.js` extensions in local imports. (see `tsconfig.json` `module: "NodeNext"`)
- Do not use `z.object()` — always use `z.strictObject()` to reject unknown fields. (see `cortex-mcp.instructions.md` SEC-001, observed in all schema files)
- Do not disable or bypass existing lint/type rules without explicit approval. (see `eslint.config.mjs`, `tsconfig.json`)
- Do not change public API (tool names, schemas, output shapes) without updating schemas, tests, and `src/instructions.md`. (see `src/schemas/`, `src/__tests__/`, `src/instructions.md`)
- Do not remove the shebang line from `src/index.ts`. (see `typescript-mcp-server.instructions.md`)

## 6) Testing Strategy (Verified)

- **Framework:** `node:test` with `assert` from `node:assert/strict` (see `src/__tests__/schemas.test.ts`)
- **Loader:** `tsx/esm` for running TypeScript tests directly (see `scripts/tasks.mjs` `detectTestLoader`)
- **Where tests live:** `src/__tests__/*.test.ts` (see `scripts/tasks.mjs` `CONFIG.test.patterns`)
- **Test files:**
  - `schemas.test.ts` — validates Zod input/output schemas accept valid and reject invalid shapes
  - `helpers.test.ts` — tests `getErrorMessage()`, `createToolResponse()`, `createErrorResponse()`
  - `session-store.test.ts` — tests `SessionStore` create/get/delete, `addThought()`, `reviseThought()`, TTL eviction
  - `reasoner.test.ts` — tests `reason()` thought count per level, abort signal, progress callback, session reuse
  - `tool-registration.test.ts` — verifies `registerAllTools` registers `reasoning_think` on the server
  - `events.test.ts` — tests engine event emission
- **Approach:** Unit tests with deterministic assertions; no external services or DB required. Tests are excluded from build via `tsconfig.json` and `tsconfig.build.json` `exclude` arrays. ESLint ignores test files (see `eslint.config.mjs` `ignores`).
- **Run targeted tests:** `node --test --import tsx/esm src/__tests__/<file>.test.ts`

## 7) Common Pitfalls (Verified Only)

- Token budgets are approximate (UTF-8 byte length / 4, not true tokenization) — do not assume precise token counts in tests. (see `src/engine/session-store.ts` `estimateTokens`)
- Sessions are in-memory only — all data is lost on process restart. Do not rely on persistence across restarts. (see `src/engine/session-store.ts`)
- The build task runner (`scripts/tasks.mjs`) must always run before `npm test` — the test command runs a pre-test build step (validate + compile) automatically; `test:fast` skips that step. (see `scripts/tasks.mjs` `TestTasks.test`, `Pipeline.testBuild`)
- `src/instructions.md` must exist or the build will fail at the validation step. (see `scripts/tasks.mjs` `BuildTasks.validate`)

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
