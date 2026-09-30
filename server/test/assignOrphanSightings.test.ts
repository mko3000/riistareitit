import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assignOrphanSightings, findUserByEmail, listOrphanSightings } from '../src/maintenance/assignOrphanSightings.js'
import { prisma } from '../src/prisma.js'
import { createTestApp, resetDatabase, signUpUser, type TestUser } from './helpers.js'
import { assertIsTestDatabase } from './testDatabase.js'

// RII-47: the one-off script that gives anonymous legacy sightings an owner.

const exec = promisify(execFile)
let app: FastifyInstance
let miko: TestUser
let other: TestUser

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDatabase()
  miko = await signUpUser(app, 'Miko')
  other = await signUpUser(app, 'Toinen')
})

async function addLegacySighting(notes: string) {
  // Created the way anonymous sightings were before RII-43: no creator.
  return prisma.sighting.create({
    data: { lat: 61, lng: 24, customSpecies: 'Metso', notes, observedDate: new Date('2026-09-01') },
  })
}

async function emailOf(user: TestUser) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
}

// Runs the real command, against the test database only.
async function runScript(args: string[], input = '') {
  assertIsTestDatabase(process.env.DATABASE_URL)
  const child = exec('npx', ['tsx', 'scripts/assign-orphan-sightings.ts', ...args], {
    env: { ...process.env },
    timeout: 60_000,
  })
  child.child.stdin?.end(input)
  try {
    const { stdout } = await child
    return { code: 0, stdout }
  } catch (err) {
    const failed = err as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout + failed.stderr }
  }
}

describe('helpers', () => {
  it('assigns only sightings without a creator, and nothing else about them', async () => {
    const legacy = await addLegacySighting('legacy')
    await app.inject({
      method: 'POST',
      url: '/sightings',
      payload: { lat: 60, lng: 25, customSpecies: 'Teeri', observedDate: '2026-09-02', notes: 'owned' },
      headers: { cookie: other.cookie },
    })

    expect((await listOrphanSightings()).map((s) => s.id)).toEqual([legacy.id])
    expect(await assignOrphanSightings(miko.id)).toBe(1)

    const after = await prisma.sighting.findUniqueOrThrow({ where: { id: legacy.id } })
    expect(after).toMatchObject({ createdByUserId: miko.id, partyId: null, notes: 'legacy', personDisplay: 'unknown' })
    const owned = await prisma.sighting.findFirstOrThrow({ where: { notes: 'owned' } })
    expect(owned.createdByUserId).toBe(other.id)
  })

  it('is idempotent: a second run finds nothing', async () => {
    await addLegacySighting('legacy')
    expect(await assignOrphanSightings(miko.id)).toBe(1)
    expect(await assignOrphanSightings(miko.id)).toBe(0)
    expect(await listOrphanSightings()).toEqual([])
  })

  it('finds accounts case-insensitively, and returns null for an unknown one', async () => {
    const email = await emailOf(miko)
    expect((await findUserByEmail(`  ${email.toUpperCase()} `))?.id).toBe(miko.id)
    expect(await findUserByEmail('nobody@example.test')).toBeNull()
  })

  it('after assigning, the owner sees the sighting and others still do not', async () => {
    await addLegacySighting('legacy')
    await assignOrphanSightings(miko.id)

    const mine = await app.inject({ method: 'GET', url: '/sightings', headers: { cookie: miko.cookie } })
    const theirs = await app.inject({ method: 'GET', url: '/sightings', headers: { cookie: other.cookie } })
    expect(mine.json().sightings.map((s: { notes: string }) => s.notes)).toEqual(['legacy'])
    expect(theirs.json().sightings).toEqual([])
  })
})

describe('the command', () => {
  it('refuses an unknown email with exit code 1 and changes nothing', async () => {
    await addLegacySighting('legacy')
    const result = await runScript(['nobody@example.test', '--yes'])

    expect(result.code).toBe(1)
    expect(result.stdout).toContain('No account with email nobody@example.test')
    expect(await listOrphanSightings()).toHaveLength(1)
  })

  it('lists the sightings and does nothing unless the answer is y', async () => {
    await addLegacySighting('legacy')
    const result = await runScript([await emailOf(miko)], 'n\n')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('1 sighting(s) without a creator')
    expect(result.stdout).toContain('2026-09-01')
    expect(result.stdout).toContain('Cancelled. Nothing changed.')
    expect(await listOrphanSightings()).toHaveLength(1)
  })

  it('assigns after y, then a second run finds nothing', async () => {
    await addLegacySighting('legacy')
    const email = await emailOf(miko)

    const first = await runScript([email], 'y\n')
    expect(first.stdout).toContain('Assigned 1 sighting(s) to Miko.')
    expect(await listOrphanSightings()).toEqual([])

    const second = await runScript([email, '--yes'])
    expect(second.code).toBe(0)
    expect(second.stdout).toContain('Nothing to do.')
  })

  it('names the database it is about to change, without the password', async () => {
    const result = await runScript([await emailOf(miko), '--yes'])
    expect(result.stdout).toMatch(/Database: localhost:\d+\/riistareitit_test/)
    // The local test password happens to equal the database name, so check for it
    // in its credential position (user:password@) rather than anywhere.
    const url = new URL(process.env.DATABASE_URL!)
    expect(result.stdout).not.toContain(`${url.username}:${url.password}@`)
    expect(result.stdout).not.toContain(`:${url.password}@`)
  })
})
