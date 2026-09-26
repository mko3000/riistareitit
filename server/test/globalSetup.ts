import { execSync } from 'node:child_process'
import { testDatabaseUrl } from './testDatabase.js'

// RII-36: runs once per `vitest run`, before any test file. Brings the test
// database's schema up to date (migrate deploy also creates the database if
// it doesn't exist) and seeds reference data (species). Never uses
// server/.env: DATABASE_URL is set explicitly, and neither dotenv nor Prisma
// override a variable that's already set.
export default function setup() {
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl() }
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' })
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' })
}
