import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const critical = { statements: 95, branches: 90, functions: 95, lines: 95 }

export default defineConfig({
  resolve: {
    alias: {
      // The examples import the package by name, as a user would.
      'line-pay-merchant': fileURLToPath(
        new URL('./src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
    passWithNoTests: true,
    environment: 'node',
    // The property tests run thousands of cases; the default 5 seconds is close
    // to what the slowest of them takes on a busy CI runner, and a test that
    // times out there would stop a release for nothing.
    testTimeout: 30_000,
    typecheck: {
      include: ['src/**/*.test-d.ts']
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts', 'src/test/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
        // The code that signs, sends, classifies failures and decides what
        // happened to a payment.
        'src/core/**': critical,
        'src/errors/**': critical,
        'src/reconcile/**': critical
      }
    }
  }
})
