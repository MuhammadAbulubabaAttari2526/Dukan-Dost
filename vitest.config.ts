import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'], coverage: { reporter: ['text', 'html'] } },
})
