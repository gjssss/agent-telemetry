# Agent Metry

This repo contains a CLI, frontend, and backend integrated in a Bun workspace.

## Packages

- `packages/cli`: `@agent-metry/cli` (private, internal)
- `packages/frontend`: `@agent-metry/frontend` (private, internal)
- `packages/backend`: `@agent-metry/backend` (private, internal)
- `packages/core`: `@agent-metry/core` (private, internal)

Published package: `agent-metry`

## Quick start

- Install deps: `bun install`
- Build all: `bun run build`
- Start bundled server: `bun run --filter @agent-metry/cli start -- server --port 3000`

`bun run build` builds frontend and backend and bundles them into the CLI package output.
