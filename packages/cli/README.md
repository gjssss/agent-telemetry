# @auto-code/cli

A modern TypeScript CLI template built with Vite.

## Usage

- Install deps from repo root: `pnpm install`
- Build: `pnpm --filter ./packages/cli build`
- Run: `pnpm --filter ./packages/cli start -- hello`
- Web: `pnpm --filter ./packages/cli start -- web`

The build step bundles frontend and backend assets into `dist/web` so the `web` command runs without the repo.

## Publish

- The CLI entry is `auto-code` via the `bin` field.
