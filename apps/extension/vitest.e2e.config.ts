import {defineConfig} from 'vitest/config'

// End-to-end tests drive a real Chrome / Firefox with the built extension.
// Run `pnpm test:e2e` (it builds first). Not part of `pnpm test`: they need
// installed browsers and take about a minute.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // One browser at a time keeps timing-sensitive checks stable.
    fileParallelism: false
  }
})
