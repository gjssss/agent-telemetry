import { defineConfig } from 'vite'

const rootDir = import.meta.dirname

export default defineConfig({
  build: {
    target: 'es2022',
    lib: {
      entry: `${rootDir}/src/index.ts`,
      formats: ['es'],
      fileName: () => 'index.js',
    },
    minify: false,
    sourcemap: true,
  },
})
