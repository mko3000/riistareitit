/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Track parsers use the browser's built-in DOMParser.
    environment: 'jsdom',
    // Frontend tests only — server/ has its own Vitest config and a test
    // database (RII-36).
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
