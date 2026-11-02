import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    environment: 'node',
    hookTimeout: 300_000,
    testTimeout: 60_000,
  },
})
