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
        '@agent-telemetry/core',
        'commander',
      ],
      output: {
        banner: '#!/usr/bin/env bun',
        paths: {
          '@agent-telemetry/core': './core/index.js'
        }
      }
    },
    minify: false,
    sourcemap: true
  }
})
