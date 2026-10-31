import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['tests/integration/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 30_000 },
})
