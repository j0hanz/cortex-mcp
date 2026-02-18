# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Model Context Protocol (MCP) server for multi-level reasoning and thought processing. (see `package.json`, `src/server.ts`)
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+, Node.js 24+ (see `package.json`, `tsconfig.json`)
  - **Frameworks:** @modelcontextprotocol/sdk (see `package.json`)
  - **Key Libraries:** `zod` (validation), `tsx` (execution), `knip` (dead code analysis) (see `package.json`)
- **Architecture:** Modular event-driven architecture with core logic in `engine/`, shared utilities in `lib/`, and MCP interfaces in `tools/`, `resources/`, and `prompts/`. (see `src/` structure)

## 2) Repository Map (High-Level)

- `src/engine/`: Core reasoning logic, session store, and event handling. (see `src/engine/reasoner.ts`)
- `src/tools/`: MCP tool definitions and implementations. (see `src/tools/index.ts`)
- `src/resources/`: MCP resource definitions. (see `src/resources/index.ts`)
- `src/prompts/`: MCP prompt definitions. (see `src/prompts/index.ts`)
- `src/schemas/`: Zod schemas for input/output validation. (see `src/schemas/`)
- `src/lib/`: Shared utilities (errors, formatting, text processing). (see `src/lib/`)
- `src/__tests__/`: Unit and integration tests. (see `src/__tests__/`)
- `scripts/`: Build and maintenance scripts. (see `scripts/`)
- `.github/workflows/`: CI/CD pipelines for release and publishing. (see `.github/workflows/`)

## 3) Operational Commands (Verified)

- **Environment:** Node.js (npm).
- **Install:** `npm install` or `npm ci` (see `package-lock.json`, `.github/workflows/release.yml`)
- **Dev:** `npm run dev` (starts tsc watch mode) or `npm run dev:run` (runs server with watch) (see `package.json`)
- **Test:** `npm run test` (full test suite) or `npm run test:fast` (fast tests via node --test) (see `package.json`)
- **Build:** `npm run build` (see `package.json`, `.github/workflows/release.yml`)
- **Lint:** `npm run lint` (runs eslint) (see `package.json`)
- **Format:** `npm run format` (runs prettier) (see `package.json`)
- **Type Check:** `npm run type-check` (see `package.json`)

## 4) Coding Standards (Style & Patterns)

- **Naming:**
  - `camelCase` for variables, functions, and file names.
  - `PascalCase` for classes, types, interfaces, and enums.
  - Enforced by ESLint naming-convention rule. (see `eslint.config.mjs`)
- **Structure:**
  - Core logic should reside in `src/engine`.
  - Tools/Resources/Prompts should be registered in their respective `index.ts` files.
- **Typing/Strictness:**
  - Strict TypeScript configuration enabled (`strict: true`). (see `tsconfig.json`)
  - No explicit `any` allowed; use `unknown` or specific types. (see `eslint.config.mjs`)
  - Return types must be explicit for functions. (see `eslint.config.mjs`)
- **Patterns Observed:**
  - **Event-Driven:** Uses `EventEmitter` (via `engineEvents`) for decoupled logic (e.g., budget exhaustion, resource updates). (observed in `src/engine/events.ts`, `src/server.ts`)
  - **Dependency Injection:** `McpServer` instance is passed to registration functions. (observed in `src/server.ts`)
  - **Validation:** Extensive use of `zod` for schema definition and validation. (observed in `src/schemas/`)
  - **Task-Based Scripts:** Build/test logic delegated to `scripts/tasks.mjs`. (observed in `package.json`)

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without using `npm install`. (see `package-lock.json`)
- Do not edit `package-lock.json` manually. (standard npm practice)
- Do not bypass `eslint` or `prettier` checks; ensure `npm run lint` passes. (see `eslint.config.mjs`)
- Do not use `any` types; strictly follow the type definitions. (see `tsconfig.json`, `eslint.config.mjs`)
- Do not modify generated files in `dist/`. (see `.gitignore`)

## 6) Testing Strategy (Verified)

- **Framework:** Node.js native test runner (`node --test`). (see `package.json` `test:fast` script)
- **Where tests live:** `src/__tests__/` directory. (see `src/__tests__/`)
- **Approach:**
  - Unit tests for individual modules (e.g., `reasoner.test.ts`, `session-store.test.ts`).
  - Tests use `tsx` for execution. (see `package.json`)
  - Mocking is likely used for complex dependencies (implied by modular structure).

## 7) Common Pitfalls (Optional; Verified Only)

- **Version Management:** Version is read from `package.json`; ensure it's updated correctly during releases. (see `src/server.ts`)
- **Session Locking:** `reasoner.ts` implements session locking; be careful with concurrency in reasoning logic. (see `src/engine/reasoner.ts`)

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
