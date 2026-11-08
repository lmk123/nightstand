import {defineConfig} from 'vitest/config'

// Renders the Chrome Web Store images (screenshots, promo tiles, store icon)
// from the real build into dist/store. Run `pnpm store-assets` (it builds
// first). Not a test: it lives under vitest only to reuse the e2e helpers.
export default defineConfig({
  test: {
    include: ['store/**/*.store.ts'],
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 60_000,
    fileParallelism: false
  }
})
