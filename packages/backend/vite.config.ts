import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    lib: {
      entry: resolve(rootDir, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        '@auto-code/core',
        ...builtinModules,
        ...builtinModules.map((module) => `node:${module}`),
      ],
      output: {
        paths: {
          '@auto-code/core': '../../core/index.js',
        },
      },
    },
    minify: false,
    sourcemap: true,
  },
})
