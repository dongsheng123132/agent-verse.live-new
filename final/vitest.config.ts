import { defineConfig } from 'vitest/config'

export default defineConfig({
  // tsconfig.json says jsx: preserve (Next compiles the JSX); tests that render a component need real JSX output.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Keep the suite deterministic: a shell that exported X402_NETWORK_MODE=testnet
    // (for `npm run dev:local`) must not flip the mainnet expectations.
    env: { X402_NETWORK_MODE: 'mainnet' },
    testTimeout: 20000,
    hookTimeout: 20000,
    // One PGlite instance per test file; keep files from running concurrently
    // against a shared in-memory instance inside the same worker.
    fileParallelism: true,
  },
})
