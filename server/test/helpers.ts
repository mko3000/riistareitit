import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/prisma.js'
import { assertIsTestDatabase } from './testDatabase.js'

export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp({ logger: false })
}

// Empties every table a test can write to. `species` is reference data,
// seeded once by globalSetup, and kept.
export async function resetDatabase(): Promise<void> {
  // Belt and braces on top of vitest.config.ts: never truncate a non-test DB.
  assertIsTestDatabase(process.env.DATABASE_URL)
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "sessions", "sightings", "tracks", "users" CASCADE')
}

export interface TestUser {
  id: string
  displayName: string
  // Ready to pass as the `cookie` request header.
  cookie: string
}

let userCounter = 0

export async function signUpUser(app: FastifyInstance, displayName = 'Testi Käyttäjä'): Promise<TestUser> {
  userCounter += 1
  const response = await app.inject({
    method: 'POST',
    url: '/signup',
    payload: { email: `user${userCounter}@example.test`, displayName, password: 'salasana123' },
  })
  if (response.statusCode !== 201) throw new Error(`signup failed: ${response.statusCode} ${response.body}`)
  return { id: response.json().user.id, displayName, cookie: sessionCookie(response.cookies) }
}

export function sessionCookie(cookies: Array<{ name: string; value: string }>): string {
  const session = cookies.find((cookie) => cookie.name === 'session_id')
  if (!session) throw new Error('no session_id cookie in response')
  return `session_id=${session.value}`
}
