import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'node_modules.partial/**'],
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
