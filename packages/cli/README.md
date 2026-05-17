# @agent-metry/cli

Agent Metry CLI built with Bun and Vite.

## Usage

- Install deps from repo root: `bun install`
- Build: `bun run --filter @agent-metry/cli build`
- Start bundled server: `bun run --filter @agent-metry/cli start -- server --port 3000`

The build step bundles frontend and backend assets into `dist/web` so the `server` command runs without the repo.

## Publish

- The CLI entry is `agent-metry` via the `bin` field.
