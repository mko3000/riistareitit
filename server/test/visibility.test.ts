import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/prisma.js'
import { createTestApp, resetDatabase, signUpUser, type TestUser } from './helpers.js'

// RII-43: every visibility / permission rule in docs/SPEC.md §9, for both
// sightings and tracks. Parties are set up directly in the database — the
// party management API arrives in RII-44.
//
// Cast: Alice and Bob share party P1 (Alice admin). Carol is alone in P2.
// Dave is in both P1 and P2.

let app: FastifyInstance
let alice: TestUser
let bob: TestUser
let carol: TestUser
let dave: TestUser
let p1: string
let p2: string

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDatabase()
  alice = await signUpUser(app, 'Alice')
  bob = await signUpUser(app, 'Bob')
  carol = await signUpUser(app, 'Carol')
  dave = await signUpUser(app, 'Dave')
  p1 = (
    await prisma.huntingParty.create({
      data: {
        name: 'P1',
        members: {
          create: [
            { userId: alice.id, role: 'admin' },
            { userId: bob.id },
            { userId: dave.id },
          ],
        },
      },
    })
  ).id
  p2 = (
    await prisma.huntingParty.create({
      data: { name: 'P2', members: { create: [{ userId: carol.id, role: 'admin' }, { userId: dave.id }] } },
    })
  ).id
})

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

function call(user: TestUser | null, method: Method, url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: user ? { cookie: user.cookie } : {} })
}

const SIGHTING = { lat: 61.5, lng: 23.75, customSpecies: 'Metso', observedDate: '2026-09-20', personDisplay: 'x' }
const TRACK = { name: 'Lenkki', sourceFormat: 'gpx', segments: [[{ lat: 61.5, lng: 23.75 }]] }

async function addSighting(user: TestUser, partyId: string | null, notes: string) {
  const response = await call(user, 'POST', '/sightings', { ...SIGHTING, partyId, notes })
  expect(response.statusCode).toBe(201)
  return response.json().sighting.id as string
}

async function addTrack(user: TestUser, partyId: string | null, name: string) {
  const response = await call(user, 'POST', '/tracks', { ...TRACK, partyId, name })
  expect(response.statusCode).toBe(201)
  return response.json().track.id as string
}

async function visibleSightings(user: TestUser): Promise<string[]> {
  const response = await call(user, 'GET', '/sightings')
  return response.json().sightings.map((s: { notes: string }) => s.notes).sort()
}

async function visibleTracks(user: TestUser): Promise<string[]> {
  const response = await call(user, 'GET', '/tracks')
  return response.json().tracks.map((t: { name: string }) => t.name).sort()
}

// Each user adds one private item and one per party they're in.
async function seedSightings() {
  await addSighting(alice, null, 'alice-private')
  await addSighting(alice, p1, 'alice-p1')
  await addSighting(bob, p1, 'bob-p1')
  await addSighting(carol, p2, 'carol-p2')
  await addSighting(carol, null, 'carol-private')
}

describe('rule 1: login required', () => {
  it.each([
    ['GET', '/sightings'],
    ['POST', '/sightings'],
    ['PATCH', '/sightings/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/sightings/00000000-0000-0000-0000-000000000000'],
    ['GET', '/tracks'],
  ] as const)('%s %s answers 401 when logged out', async (method, url) => {
    const response = await call(null, method, url, method === 'POST' || method === 'PATCH' ? SIGHTING : undefined)
    expect(response.statusCode).toBe(401)
    expect(response.json().error).toBe('not_logged_in')
  })

  it('GET /species stays public (reference data)', async () => {
    expect((await call(null, 'GET', '/species')).statusCode).toBe(200)
  })
})

describe('rule 3: who sees which sightings', () => {
  beforeEach(seedSightings)

  it('you see your own private items and everything in your party', async () => {
    expect(await visibleSightings(alice)).toEqual(['alice-p1', 'alice-private', 'bob-p1'])
    expect(await visibleSightings(bob)).toEqual(['alice-p1', 'bob-p1'])
  })

  it("you don't see another party's items or other users' private items", async () => {
    expect(await visibleSightings(carol)).toEqual(['carol-p2', 'carol-private'])
  })

  it('in several parties you see the union of them', async () => {
    expect(await visibleSightings(dave)).toEqual(['alice-p1', 'bob-p1', 'carol-p2'])
  })

  it('a user in no party sees only their own items', async () => {
    const eve = await signUpUser(app, 'Eve')
    await addSighting(eve, null, 'eve-private')
    expect(await visibleSightings(eve)).toEqual(['eve-private'])
  })

  it("rule 5: after leaving, you lose others' party items but keep your own; yours stay with the party", async () => {
    await prisma.huntingPartyMember.delete({ where: { partyId_userId: { partyId: p1, userId: bob.id } } })

    expect(await visibleSightings(bob)).toEqual(['bob-p1'])
    expect(await visibleSightings(alice)).toEqual(['alice-p1', 'alice-private', 'bob-p1'])
  })

  it('rule 6: deleting a party makes its items private to their creators', async () => {
    await prisma.huntingParty.delete({ where: { id: p1 } })

    expect(await visibleSightings(bob)).toEqual(['bob-p1'])
    expect(await visibleSightings(alice)).toEqual(['alice-p1', 'alice-private'])
    expect(await visibleSightings(dave)).toEqual(['carol-p2'])
  })

  it('legacy anonymous sightings (no creator, no party) are visible to no one', async () => {
    await prisma.sighting.create({
      data: { lat: 61, lng: 24, customSpecies: 'Teeri', notes: 'legacy', observedDate: new Date('2026-09-01') },
    })
    for (const user of [alice, bob, carol, dave]) expect(await visibleSightings(user)).not.toContain('legacy')
  })
})

describe('rule 2: an item goes to one of your parties, or stays private', () => {
  it('omitting partyId creates a private sighting', async () => {
    const response = await call(alice, 'POST', '/sightings', SIGHTING)
    expect(response.json().sighting.partyId).toBeNull()
  })

  it.each([
    ["a party you're not in", () => p2],
    ['an unknown party', () => '00000000-0000-0000-0000-000000000000'],
    ['a malformed id', () => 'not-a-uuid'],
    ['a non-string', () => 42],
  ])('rejects %s', async (_case, partyId) => {
    const response = await call(alice, 'POST', '/sightings', { ...SIGHTING, partyId: partyId() })
    expect(response.statusCode).toBe(400)
    expect(Object.keys(response.json().fieldErrors)).toEqual(['partyId'])
    expect(await prisma.sighting.count()).toBe(0)
  })
})

describe('rule 4: only the creator edits or deletes a sighting', () => {
  let aliceP1: string
  beforeEach(async () => {
    aliceP1 = await addSighting(alice, p1, 'alice-p1')
  })

  it('a party member who can see it gets 403', async () => {
    expect((await call(bob, 'PATCH', `/sightings/${aliceP1}`, SIGHTING)).statusCode).toBe(403)
    expect((await call(bob, 'DELETE', `/sightings/${aliceP1}`)).statusCode).toBe(403)
  })

  it("someone who can't see it gets 404, as if it didn't exist", async () => {
    expect((await call(carol, 'PATCH', `/sightings/${aliceP1}`, SIGHTING)).statusCode).toBe(404)
    expect((await call(carol, 'DELETE', `/sightings/${aliceP1}`)).statusCode).toBe(404)
  })

  it('the creator can edit: omitted partyId keeps it, null makes it private', async () => {
    const kept = await call(alice, 'PATCH', `/sightings/${aliceP1}`, { ...SIGHTING, notes: 'edited' })
    expect(kept.json().sighting).toMatchObject({ notes: 'edited', partyId: p1 })

    const privatized = await call(alice, 'PATCH', `/sightings/${aliceP1}`, { ...SIGHTING, partyId: null })
    expect(privatized.json().sighting.partyId).toBeNull()
    expect(await visibleSightings(bob)).toEqual([])
  })

  it("the creator can't move it into a party they're not in", async () => {
    const response = await call(alice, 'PATCH', `/sightings/${aliceP1}`, { ...SIGHTING, partyId: p2 })
    expect(response.statusCode).toBe(400)
  })

  it('the creator can delete', async () => {
    expect((await call(alice, 'DELETE', `/sightings/${aliceP1}`)).statusCode).toBe(204)
  })
})

describe('tracks follow the same rules', () => {
  beforeEach(async () => {
    await addTrack(alice, null, 'alice-private')
    await addTrack(alice, p1, 'alice-p1')
    await addTrack(carol, p2, 'carol-p2')
  })

  it('visibility: own + party, union across parties, nothing from other parties', async () => {
    expect(await visibleTracks(alice)).toEqual(['alice-p1', 'alice-private'])
    expect(await visibleTracks(bob)).toEqual(['alice-p1'])
    expect(await visibleTracks(carol)).toEqual(['carol-p2'])
    expect(await visibleTracks(dave)).toEqual(['alice-p1', 'carol-p2'])
  })

  it("rejects a party you're not in", async () => {
    const response = await call(alice, 'POST', '/tracks', { ...TRACK, partyId: p2 })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_input')
  })

  it("delete: party member 403, outsider 404, owner 204", async () => {
    const tracks = (await call(alice, 'GET', '/tracks')).json().tracks as Array<{ id: string; name: string }>
    const id = tracks.find((t) => t.name === 'alice-p1')!.id

    expect((await call(bob, 'DELETE', `/tracks/${id}`)).statusCode).toBe(403)
    expect((await call(carol, 'DELETE', `/tracks/${id}`)).statusCode).toBe(404)
    expect((await call(alice, 'DELETE', `/tracks/${id}`)).statusCode).toBe(204)
  })
})
