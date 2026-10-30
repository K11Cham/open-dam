/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  // `npm run dev` serves the app; online games go to the Worker from
  // `npm run server` on port 8787 (see docs/MULTIPLAYER.md).
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
