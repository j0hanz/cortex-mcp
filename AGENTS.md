# AGENTS.md

Multi-level reasoning MCP server with configurable depth levels, implemented in TypeScript and packaged for local stdio use plus CI/release automation via Docker and GitHub Actions.

## Tooling

- **Manager**: npm
- **Frameworks**: TypeScript, Zod v4, @modelcontextprotocol/sdk, ESLint, Prettier

## Commands

- **Dev**: `npm run dev`
- **Test**: `npm run test`
- **Lint**: `npm run lint`
- **Deploy**: N/A

## Safety Boundaries

- **Always**: `npm run lint`, `npm run type-check`, `npm run test`, `npm run build`
- **Ask First**: `npm run test:coverage`, `npm run format`, dependency installs/updates, Docker/GitHub Actions/release changes, deleting files, migrations, `git push --force`
- **Never**: commit or expose secrets/credentials; edit `dist/`, `node_modules/`, or `.git/`; modify `.github/claude-cource/docs/community/seps/1046-support-oauth-client-credentials-flow-in-authoriza.mdx`, `.github/claude-cource/docs/extensions/auth/oauth-client-credentials.mdx`, `.github/claude-cource/seps/1046-support-oauth-client-credentials-flow-in-authoriza.md`; commit `.env`

## Directory Overview

```text
.
├── src/                      # MCP server source
│   ├── index.ts              # CLI entrypoint
│   ├── server.ts             # server wiring/capabilities
│   ├── tools/                # tool registration/handlers
│   ├── schemas/              # Zod input/output schemas
│   ├── resources/            # MCP resources
│   ├── prompts/              # MCP prompts
│   ├── engine/               # reasoning engine/session logic
│   ├── lib/                  # shared utilities/contracts
│   └── __tests__/            # node:test suite
├── scripts/                  # task runner scripts
├── assets/                   # static assets
├── memory_db/                # local memory database artifacts
├── Dockerfile                # container build
├── docker-compose.yml        # local orchestration
├── package.json              # scripts/dependencies
├── server.json               # MCP server metadata/package info
└── README.md                 # usage and docs
```

## Navigation

- **Entry Points**: `src/index.ts`, `src/server.ts`, `package.json`, `README.md`, `docker-compose.yml`
- **Key Configs**: `tsconfig.json`, `tsconfig.build.json`, `tsconfig.test.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`, `.github/workflows/release.yml`

## Don'ts

- Don't bypass existing lint/type rules without approval.
- Don't ignore test failures in CI.
- Don't use unapproved third-party packages (verify against `package.json`).
- Don't hardcode secrets or credentials in code, tests, or docs.
- Don't commit `.env` or credential-like content.
- Don't edit generated/vendor paths (`dist/`, `node_modules/`, `.git/`).
- Don't modify release workflow/versioning behavior without approval.
- Don't run release/publish/tag/push automation without explicit approval.

## Change Checklist

1. Run `npm run lint`.
2. Run `npm run type-check`.
3. Run `npm run test`.
4. Run `npm run build`.
5. If touching release/publish files, get approval before merging.
