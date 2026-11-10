import { defineConfig } from 'vite'

// React's automatic JSX runtime is handled by esbuild directly. This keeps the
// production CSP free of inline dev-refresh scripts while still building TSX.
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  server: {
    port: 5199,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    target: 'chrome140',
    assetsInlineLimit: 0,
  },
})
