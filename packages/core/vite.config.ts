import { defineConfig } from 'vite'

const rootDir = import.meta.dirname

export default defineConfig({
  build: {
    target: 'es2022',
    lib: {
      entry: {
        index: `${rootDir}/src/index.ts`,
        codex: `${rootDir}/src/codex.ts`,
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    minify: false,
    rollupOptions: {
      external: [/^node:/],
    },
    sourcemap: true,
  },
})
