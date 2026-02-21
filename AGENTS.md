# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Multi-level reasoning MCP server that decomposes queries into structured thought chains at configurable depth levels (basic, normal, high).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ (see `package.json` `devDependencies`), Node.js >= 24 (see `package.json` `engines`)
  - **Frameworks:** `@modelcontextprotocol/sdk` ^1.26.0 (see `package.json` `dependencies`)
  - **Key Libraries:** Zod ^4.3.6 (validation/schemas), `tsx` (test loader), `typescript-eslint` (linting) (see `package.json`)
- **Architecture:** Single-package MCP server using stdio transport. Engine layer (`src/engine/`) manages in-memory session state and reasoning logic. Tools/resources/prompts are registered modularly. Sessions are ephemeral (in-memory, 30-minute TTL). (see `src/server.ts`, `src/engine/session-store.ts`)

## 2) Repository Map (High-Level)

- `src/index.ts`: CLI entrypoint — shebang, `StdioServerTransport` wiring, graceful shutdown (see `src/index.ts`)
- `src/server.ts`: `McpServer` instantiation, capability declaration, engine event wiring (see `src/server.ts`)
- `src/engine/`: Reasoning engine core — `reasoner.ts` (session resolution, thought heuristic), `session-store.ts` (in-memory LRU store with TTL/eviction), `config.ts` (level configs), `context.ts` (AsyncLocalStorage), `events.ts` (typed EventEmitter)
- `src/tools/`: Tool registration — one tool per file (`reasoning-think.ts`), `index.ts` aggregates (see `src/tools/`)
- `src/resources/`: Resource registration — static (`internal://instructions`) and templated (`reasoning://sessions/{sessionId}`, traces) (see `src/resources/index.ts`)
- `src/prompts/`: Prompt registration — level-specific and continuation prompts (see `src/prompts/index.ts`)
- `src/schemas/`: Zod input/output schemas — `inputs.ts` (tool input validation), `outputs.ts` (structured output shapes) (see `src/schemas/`)
- `src/lib/`: Shared utilities — `errors.ts`, `formatting.ts`, `tool-response.ts`, `types.ts`, `validators.ts`, `text.ts`, `instructions.ts`
- `src/__tests__/`: Unit tests using `node:test` runner (see `src/__tests__/`)
- `scripts/tasks.mjs`: Build orchestration script (clean, compile, copy assets, test runner) (see `scripts/tasks.mjs`)
- `assets/`: Static assets (SVG logo) copied into `dist/assets/` at build time
- `.github/workflows/release.yml`: CI/CD — version bump, lint, type-check, test, build, npm publish, MCP Registry publish, Docker build (see `.github/workflows/release.yml`)

> Ignore: `dist/`, `node_modules/`, `coverage/`, `.tmp/`, `.agents/`

## 3) Operational Commands (Verified)

- **Environment:** Node.js >= 24, npm (see `package.json` `engines`; lockfile: `package-lock.json`)
- **Install:** `npm ci` (see `.github/workflows/release.yml` — CI uses `npm ci`)
- **Dev:** `npm run dev` (`tsc --watch`) or `npm run dev:run` (`node --env-file=.env --watch dist/index.js`) (see `package.json` scripts)
- **Build:** `npm run build` — executes `node scripts/tasks.mjs build` which cleans `dist/`, compiles via `tsc -p tsconfig.build.json`, copies assets, makes entrypoint executable (see `package.json`, `scripts/tasks.mjs`)
- **Test:** `npm run test` — builds first, then runs `node --test --import tsx/esm` over `src/__tests__/**/*.test.ts` (see `scripts/tasks.mjs`, `.github/workflows/release.yml`)
- **Type-check:** `npm run type-check` — checks both `src` (`tsconfig.json`) and tests (`tsconfig.test.json`) (see `package.json`, `scripts/tasks.mjs`)
- **Lint:** `npm run lint` (`eslint .`) (see `package.json`, `.github/workflows/release.yml`)
- **Format:** `npm run format` (`prettier --write .`) (see `package.json`)
- **Lint+Fix:** `npm run lint:fix` (see `package.json`)
- **Inspector:** `npm run inspector` — builds then launches `@modelcontextprotocol/inspector` (see `package.json`)
- **Dead code:** `npm run knip` (see `package.json`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase for variables/functions, PascalCase for types/interfaces/enums, UPPER_CASE for module-level constants. Properties are unformatted. (see `eslint.config.mjs` `@typescript-eslint/naming-convention`)
- **Structure:** Engine logic in `src/engine/`, shared utilities in `src/lib/`, one tool per file in `src/tools/`. Each registration layer has an `index.ts` that exposes a `registerAll*` function. (observed in `src/tools/index.ts`, `src/resources/index.ts`, `src/prompts/index.ts`)
- **Typing/Strictness:** TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. (see `tsconfig.json`)
- **Imports:** Type-only imports required (`@typescript-eslint/consistent-type-imports`). Import order enforced via `@trivago/prettier-plugin-sort-imports` in `.prettierrc`. `.js` extensions on local imports (NodeNext resolution).
- **Formatting:** Prettier — single quotes, trailing commas (`es5`), 2-space indent, 80-char print width, LF line endings. (see `.prettierrc`)
- **Patterns Observed:**
  - Immutable session snapshots: `SessionStore` stores mutable internal state but always returns frozen snapshots via `snapshotSession()`. External code only sees `Readonly<Session>`. (observed in `src/engine/session-store.ts`)
  - Typed EventEmitter: Engine events use a typed `EventEmitter` wrapper for compile-time event name/payload safety. (observed in `src/engine/events.ts`)
  - Structured tool output: Tools always return both `content` (JSON text) and `structuredContent` (typed object) for backward compatibility. Error responses use `isError: true` with `{ ok: false, error: { code, message } }`. (observed in `src/tools/reasoning-think.ts`, `src/lib/tool-response.ts`)
  - AsyncLocalStorage context: Engine operations run inside `AsyncLocalStorage` context carrying `sessionId` and `abortSignal`. (observed in `src/engine/context.ts`)
  - Session locking: Per-session async mutex via promise chain prevents concurrent mutations. (observed in `src/engine/reasoner.ts`)
  - `z.strictObject()` for all Zod schemas — rejects unknown fields. (observed in `src/schemas/inputs.ts`, `src/schemas/outputs.ts`)
  - Explicit function return types enforced by ESLint. (see `eslint.config.mjs`)
  - No default exports — named exports only. (observed across all `src/` files)

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and running `npm install` to regenerate `package-lock.json`. (see `package-lock.json`)
- Do not edit `package-lock.json` manually. (see `package-lock.json`)
- Do not commit secrets; never print `.env` values; use environment variables for configuration. (see `.gitignore` — `.env` is gitignored)
- Do not change the `reasoning_think` tool contract (input/output schema) without updating `src/instructions.md`, `README.md`, tests, and noting migration impact. (see `src/instructions.md`, `src/schemas/`)
- Do not write to `stdout` in non-MCP contexts — it corrupts the stdio JSON-RPC transport. Use `console.error()` or protocol logging. (see `.github/instructions/typescript-mcp-server.instructions.md`)
- Do not use default exports; use named exports only. (observed across all `src/` files)
- Do not disable or bypass existing lint/type rules without explicit approval. (see `eslint.config.mjs`, `tsconfig.json`)
- Do not use `z.object()` — always use `z.strictObject()` for new schemas. (see `.github/instructions/typescript-mcp-server.instructions.md`)
- Do not omit `.js` extensions on local TypeScript imports (NodeNext resolution requires them). (see `tsconfig.json`)

## 6) Testing Strategy (Verified)

- **Framework:** Node.js built-in `node:test` runner with `node:assert/strict` (see `src/__tests__/reasoner.test.ts`)
- **Loader:** `tsx/esm` — runs TypeScript tests directly without pre-compilation (see `scripts/tasks.mjs`, `package.json` `test:fast`)
- **Where tests live:** `src/__tests__/*.test.ts` (see `tsconfig.test.json`, `scripts/tasks.mjs`)
- **Approach:** Unit tests covering engine logic (session creation, thought storage, heuristic bounds, abort handling, token budget exhaustion), schema validation, formatting, and tool registration. Tests clean up sessions via `sessionStore.delete()`. No external services, mocks, or fixtures required. (observed in `src/__tests__/reasoner.test.ts`)
- **CI validation:** `npm run lint` → `npm run type-check` → `npm run test` → `npm run build` (see `.github/workflows/release.yml`)

## 7) Common Pitfalls (Verified Only)

- Token counting is approximate (UTF-8 byte length ÷ 4), not true tokenization — do not rely on exact token counts. (see `src/engine/session-store.ts` `estimateTokens()`)
- Sessions are in-memory only — all data is lost on process restart. Do not assume persistence. (see `src/instructions.md`)
- The `build` script must run before `test` — `scripts/tasks.mjs test` calls `Pipeline.fullBuild()` internally. (see `scripts/tasks.mjs`)
- ESLint config references `tsconfig.tests.json` (with an 's') in `parserOptions` but the actual file is `tsconfig.test.json` — this may cause ESLint type-aware linting issues for test files. (see `eslint.config.mjs` line 38)

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
