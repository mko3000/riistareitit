// RII-36: the one place that decides which database tests use. Tests must
// never touch the dev database, so anything not named *_test is refused.

const DEFAULT_TEST_DATABASE_URL = 'postgresql://riistareitit:riistareitit@localhost:5433/riistareitit_test'

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL
  assertIsTestDatabase(url)
  return url
}

export function assertIsTestDatabase(url: string | undefined): void {
  const databaseName = url ? new URL(url).pathname.replace(/^\//, '') : ''
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}": its name must end in "_test". ` +
        'Set TEST_DATABASE_URL to a dedicated test database.',
    )
  }
}
