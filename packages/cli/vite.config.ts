import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

const rootDir = import.meta.dirname

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    target: 'es2022',
    lib: {
      entry: `${rootDir}/src/cli.ts`,
      formats: ['es'],
      fileName: () => 'cli.js'
    },
    rollupOptions: {
      external: [
        '@agent-metry/core',
        '@agent-metry/core/codex',
        'bun:sqlite',
        'commander',
      ],
      output: {
        banner: '#!/usr/bin/env bun',
        paths: {
          '@agent-metry/core': './core/index.js',
          '@agent-metry/core/codex': './core/codex.js'
        }
      }
    },
    minify: false,
    sourcemap: true
  }
})
