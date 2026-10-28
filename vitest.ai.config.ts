import { defineConfig } from 'vitest/config'

// Slow AI strength matches. Kept out of the default test run; see scripts/ai-strength.test.ts.
export default defineConfig({
  test: {
    include: ['scripts/ai-strength.test.ts'],
    testTimeout: 15 * 60_000,
  },
})
