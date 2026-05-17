import { defineConfig } from 'vite'

const rootDir = import.meta.dirname

export default defineConfig({
  ssr: {
    noExternal: [
      '@better-auth/drizzle-adapter',
      'better-auth',
      'drizzle-orm',
    ],
  },
  build: {
    ssr: true,
    target: 'es2022',
    outDir: 'dist',
    lib: {
      entry: `${rootDir}/src/index.ts`,
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        '@agent-telemetry/core',
        'bun:sqlite',
        'hono',
        'hono/bun',
        'node:fs',
        'node:os',
        'node:path',
      ],
      output: {
        paths: {
          '@agent-telemetry/core': '../../core/index.js',
        },
      },
    },
    minify: false,
    sourcemap: true,
  },
})
