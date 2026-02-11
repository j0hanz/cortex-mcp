# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Multi-level reasoning MCP server with configurable depth levels.
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+, Node.js >=20 (see `package.json`)
  - **Frameworks:** MCP SDK (`@modelcontextprotocol/sdk`), Node.js native test runner (`node:test`) (see `package.json`, `scripts/tasks.mjs`)
  - **Key Libraries:** `zod` (validation), `tsx` (execution) (see `package.json`)
- **Architecture:** Modular server architecture separating core reasoning engine (`src/engine/`), tool definitions (`src/tools/`), and transport layer (`src/index.ts`).

## 2) Repository Map (High-Level)

- `src/index.ts`: Application entry point (Stdio transport setup)
- `src/server.ts`: Server factory and tool registration
- `src/engine/`: Core business logic (reasoning, session management, events)
- `src/tools/`: MCP tool implementations
- `src/lib/`: Shared types, errors, and utilities
- `src/__tests__/`: Unit and integration tests
- `scripts/`: Build and maintenance scripts (custom task runner)
  > Ignore `dist/`, `node_modules/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js >= 20 (see `package.json` engines)
- **Install:** `npm install` (see `package-lock.json`)
- **Dev:** `npm run inspector` (runs MCP inspector on built server) (see `package.json`)
- **Test:** `npm test` (executes `node --test` via `scripts/tasks.mjs`) (see `package.json`, `scripts/tasks.mjs`)
- **Build:** `npm run build` (cleans, compiles, and packages assets via `scripts/tasks.mjs`) (see `package.json`)
- **Type-Check:** `npm run type-check` (runs `tsc` for verification) (see `package.json`)
- **Lint:** `npx eslint .` (config in `eslint.config.mjs`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** Kebab-case for filenames (e.g., `session-store.ts`, `reasoning-think.ts`).
- **Structure:** Core logic resides in `src/engine`; tools are isolated in `src/tools`.
- **Typing/Strictness:** TypeScript `strict: true`, `noUncheckedIndexedAccess: true` enabled (see `tsconfig.json`).
- **Patterns Observed:**
  - **Custom Task Runner:** Uses `scripts/tasks.mjs` for orchestration instead of complex npm scripts.
  - **Event-Driven:** Uses internal event emitters for side effects (observed in `src/engine/events.ts`, used in `src/engine/reasoner.ts`).
  - **Factory Pattern:** Server creation via `createServer` factory (observed in `src/server.ts`).
  - **Module-Level State:** Singleton-like exports for stores (observed in `src/engine/reasoner.ts`).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and `package-lock.json`.
- Do not edit `package-lock.json` manually.
- Do not use `console.log` in production code; use the provided logger or standard error if necessary (enforced by `eslint.config.mjs`).
- Do not bypass the custom task runner (`scripts/tasks.mjs`) for build/test operations; it handles cleanup and asset copying.
- Do not modify public tool interfaces without verifying backward compatibility.

## 6) Testing Strategy (Verified)

- **Framework:** `node:test` (native Node.js test runner) (see `scripts/tasks.mjs`).
- **Where tests live:** `src/__tests__/*.test.ts` (see `scripts/tasks.mjs` config).
- **Approach:** Unit tests using `node:assert/strict`. Tests import internal modules directly (e.g., `import { reason } from '../engine/reasoner.js'`) (see `src/__tests__/reasoner.test.ts`).

## 7) Common Pitfalls (Optional; Verified Only)

- **Build Assets:** The build process manually copies `instructions.md` and `AGENTS.md` to `dist/`. Changes to asset handling must update `scripts/tasks.mjs`.
- **Large Icons:** The build script warns if icon assets exceed 2MB (see `scripts/tasks.mjs`).

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
