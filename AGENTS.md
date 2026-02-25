# AGENTS.md

TypeScript MCP server using npm with Docker/GitHub Actions infrastructure and strict lint/type-check/test workflows.

## Tooling

- **Manager**: npm
- **Frameworks**: TypeScript, @modelcontextprotocol/sdk, Zod, ESLint, Prettier, tsx, knip

## Commands

- **Dev**: `npm run dev`
- **Test**: `npm run test`
- **Lint**: `npm run lint`
- **Deploy**: N/A

## Safety Boundaries

- **Always**: `npm run lint`, `npm run type-check`, `npm run test`
- **Ask First**: `npm run build`, `npm run test:coverage`, release/publish workflow changes, Docker/Ansible/infrastructure changes, deleting files
- **Never**: commit secrets/credentials, edit generated/vendor directories (`dist/`, `node_modules/`, `.git/`), commit or manually edit `memory.db`

## Directory Overview

```text
.
├── .github/
│   └── workflows/                 # Release/publish automation
├── assets/                        # Static assets used by the server
├── scripts/                       # Task runner scripts
├── src/
│   ├── __tests__/                 # Node test suite
│   ├── resources/                 # MCP resource registration/content
│   ├── tools/                     # MCP tool implementations
│   └── index.ts                   # Runtime entrypoint
├── package.json                   # Scripts and package metadata
├── server.json                    # MCP server metadata
├── Dockerfile                     # Container build definition
└── docker-compose.yml             # Local container orchestration
```

## Navigation

- **Entry Points**: `package.json`, `README.md`, `src/index.ts`, `src/server.ts`, `docker-compose.yml`
- **Key Configs**: ESLint, Git, Prettier, TypeScript

## Don'ts

- Don't edit generated output in `dist/`.
- Don't commit `.env` or any credentials/secrets.
- Don't run publish/release/deploy-style changes without explicit approval.
- Don't modify vendor/dependency content under `node_modules/`.

## Change Checklist

1. Run `npm run lint`, `npm run type-check`, and `npm run test` before handing off.
2. Keep changes in source/config files (not generated/vendor outputs) and update docs when behavior changes.
