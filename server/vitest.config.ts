import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './test/testDatabase.ts'

// RII-36: route tests against a real Postgres test database. See
// docs/SPEC.md §3 "Testing".
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // Set before any test module loads, so src/env.ts's dotenv and Prisma
    // never fall back to server/.env's dev database.
    // MML_API_KEY is a fake — tile tests stub fetch and never call MML.
    env: { DATABASE_URL: testDatabaseUrl(), MML_API_KEY: 'test-mml-api-key' },
    // All files share one database; run them one at a time.
    fileParallelism: false,
  },
})
