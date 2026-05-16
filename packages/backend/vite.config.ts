import { defineConfig } from 'vite'

const rootDir = import.meta.dirname

export default defineConfig({
  build: {
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
        'hono',
        'hono/bun',
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
