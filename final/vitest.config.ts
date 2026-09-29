import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // One PGlite instance per test file; keep files from running concurrently
    // against a shared in-memory instance inside the same worker.
    fileParallelism: true,
  },
})
