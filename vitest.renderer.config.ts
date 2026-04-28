import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/renderer/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['tests/renderer/setup.ts'],
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
})
