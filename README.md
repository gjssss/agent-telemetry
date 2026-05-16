# Agent Telemetry

This repo contains a CLI, frontend, and backend integrated in a Bun workspace.

## Packages

- `packages/cli`: `@agent-telemetry/cli` (private, internal)
- `packages/frontend`: `@agent-telemetry/frontend` (private, internal)
- `packages/backend`: `@agent-telemetry/backend` (private, internal)
- `packages/core`: `@agent-telemetry/core` (private, internal)

Published package: `agent-telemetry`

## Quick start

- Install deps: `bun install`
- Build all: `bun run build`
- Start bundled server: `bun run --filter @agent-telemetry/cli start -- server --port 3000`

`bun run build` builds frontend and backend and bundles them into the CLI package output.
