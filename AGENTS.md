# AGENTS.md

TypeScript MCP server for multi-step reasoning sessions (`reasoning_think`) with task/progress support and session resources.

## Tooling

- Package manager: `npm`
- Runtime: Node.js `>=24`
- Language: TypeScript (ESM, strict configs)

## Commands

- Install deps: `npm ci`
- Build: `npm run build` _(expensive; compiles + asset copy + chmod via `scripts/tasks.mjs`)_
- Lint (all): `npm run lint`
- Lint (tests only): `npm run lint:tests`
- Type-check (all): `npm run type-check`
- Type-check (src only): `npm run type-check:src`
- Type-check (tests only): `npm run type-check:tests`
- Test (default): `npm run test`
- Test (fast): `npm run test:fast`
- Test (coverage): `npm run test:coverage` _(expensive)_
- Inspector: `npm run inspector` _(build + inspector; expensive)_

### File-scoped edit/format helpers

- ESLint fix one file: `npx eslint --fix <file>`
- Prettier write one file: `npx prettier --write <file>`

## Safety and Permissions

### Always

- Prefer the smallest possible change set; keep behavior and public tool contracts stable.
- Run targeted checks first (`lint`, relevant type-check/test script) before broader commands.
- Preserve MCP response conventions used in this repo (`content` JSON text + `structuredContent` on success).
- Follow the existing source layout and `.js` local import style in TypeScript source.

### Ask first

- Installing/upgrading dependencies or changing `package-lock.json`.
- Running full expensive flows (`npm run build`, `npm run test:coverage`, `npm run inspector`) when not required.
- Editing CI/release automation (`.github/workflows/release.yml`, `server.json`) or Docker files.
- Deleting files, changing top-level structure, or altering version/release metadata.

### Never

- Commit or expose secrets/credentials from env/config.
- Edit generated or dependency folders (`dist/`, `node_modules/`).
- Make production/release changes (publish, tagging, pushing) without explicit approval.

## Navigation

- Entrypoints: `src/index.ts`, `src/server.ts`
- Tool registration: `src/tools/index.ts`
- Main tool implementation: `src/tools/reasoning-think.ts`
- Reasoning engine/session logic: `src/engine/`
- Shared utilities: `src/lib/`
- Schemas: `src/schemas/inputs.ts`, `src/schemas/outputs.ts`
- Prompts/resources: `src/prompts/`, `src/resources/`
- Tests: `src/__tests__/`
- Build/test task orchestrator: `scripts/tasks.mjs`

## Examples to Follow

- Tool contract + error mapping pattern: `src/tools/reasoning-think.ts`
- Reasoning behavior tests (deterministic assertions): `src/__tests__/reasoner.test.ts`
- Build/test orchestration pattern: `scripts/tasks.mjs`

## Patterns to Avoid

- Do not copy from generated outputs in `dist/`.
- Avoid broad `eslint-disable` usage in source modules; keep suppressions tightly scoped.
- Do not introduce ad-hoc command scripts when `scripts/tasks.mjs` already owns build/test orchestration.

## PR / Change Checklist

- Commands you ran are listed in the PR notes.
- Lint/type-check/tests relevant to changed files pass.
- MCP tool/resource/prompt schemas stay aligned with runtime behavior.
- README or resource docs are updated if tool behavior or contracts change.

## When Stuck

- Ask one clarifying question instead of guessing requirements.
- Propose a minimal 2–4 step plan before broad refactors.
- Prefer extending existing patterns over introducing new abstractions.
