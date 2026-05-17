import { defineConfig } from 'bumpp'

export default defineConfig({
  files: [
    'package.json',
    'packages/cli/package.json',
  ],
  commit: 'chore(release): v%s',
  tag: 'v%s',
  push: true,
  all: true,
  execute: 'sh -c "bun install --lockfile-only && npm publish"',
})
