import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // Node 24 ships WebCrypto, URL and TextEncoder as globals, which is all
    // core needs, so no DOM emulation.
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
