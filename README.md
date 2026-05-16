# auto-code monorepo

This repo contains a CLI, frontend, and backend integrated in a pnpm monorepo.

## Packages

- `packages/cli`: `@auto-code/cli` (private, internal)
- `packages/frontend`: `@auto-code/frontend` (private, internal)
- `packages/backend`: `@auto-code/backend` (private, internal)
- `packages/core`: `@auto-code/core` (private, internal)

Published package: `auto-code`

## Quick start

- Install deps: `pnpm install`
- Build all: `pnpm build`
- Start CLI: `pnpm start:cli -- hello`
- Start web server: `pnpm start:cli -- web`

`pnpm build` builds frontend and backend and bundles them into the CLI package output.
