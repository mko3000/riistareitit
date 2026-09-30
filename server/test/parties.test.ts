import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/prisma.js'
import { createTestApp, resetDatabase, signUpUser, type TestUser } from './helpers.js'

// RII-44: party management API (docs/SPEC.md §9 "Parties" and "Party API").

let app: FastifyInstance
let alice: TestUser
let bob: TestUser
let carol: TestUser

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
})

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

function call(user: TestUser | null, method: Method, url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: user ? { cookie: user.cookie } : {} })
}

// Alice creates "Porukka" (admin); Bob joins by its invite code.
async function partyWithAliceAndBob() {
  const created = (await call(alice, 'POST', '/parties', { name: 'Porukka' })).json().party
  const joined = await call(bob, 'POST', `/invites/${created.inviteCode}/join`)
  expect(joined.statusCode).toBe(200)
  return created as { id: string; inviteCode: string }
}

describe('login', () => {
  it.each([
    ['GET', '/parties'],
    ['POST', '/parties'],
    ['GET', '/invites/whatever'],
    ['POST', '/invites/whatever/join'],
  ] as const)('%s %s answers 401 when logged out', async (method, url) => {
    expect((await call(null, method, url, method === 'POST' ? { name: 'x' } : undefined)).statusCode).toBe(401)
  })
})

describe('creating and listing parties', () => {
  it('the creator becomes admin and gets an invite code right away', async () => {
    const response = await call(alice, 'POST', '/parties', { name: '  Metsäporukka  ' })

    expect(response.statusCode).toBe(201)
    const { party } = response.json()
    expect(party).toMatchObject({
      name: 'Metsäporukka',
      myRole: 'admin',
      members: [{ userId: alice.id, displayName: 'Alice', role: 'admin' }],
    })
    expect(party.inviteCode).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it.each([['empty', '   '], ['too long', 'x'.repeat(101)], ['not a string', 42]])(
    'rejects a %s name',
    async (_case, name) => {
      const response = await call(alice, 'POST', '/parties', { name })
      expect(response.statusCode).toBe(400)
      expect(await prisma.huntingParty.count()).toBe(0)
    },
  )

  it('GET /parties lists only my parties, with role and member count', async () => {
    await partyWithAliceAndBob()
    await call(carol, 'POST', '/parties', { name: 'Carolin porukka' })

    expect((await call(bob, 'GET', '/parties')).json().parties).toEqual([
      expect.objectContaining({ name: 'Porukka', myRole: 'member', memberCount: 2 }),
    ])
    expect((await call(carol, 'GET', '/parties')).json().parties.map((p: { name: string }) => p.name)).toEqual([
      'Carolin porukka',
    ])
  })
})

describe('party details', () => {
  it('members see members (admins first); only admins see the invite code', async () => {
    const party = await partyWithAliceAndBob()

    const asBob = (await call(bob, 'GET', `/parties/${party.id}`)).json().party
    expect(asBob.members.map((m: { displayName: string }) => m.displayName)).toEqual(['Alice', 'Bob'])
    expect(asBob.inviteCode).toBeNull()
    expect((await call(alice, 'GET', `/parties/${party.id}`)).json().party.inviteCode).toBe(party.inviteCode)
  })

  it("a non-member gets 404 for everything, as if the party didn't exist", async () => {
    const party = await partyWithAliceAndBob()
    for (const [method, url, payload] of [
      ['GET', `/parties/${party.id}`, undefined],
      ['PATCH', `/parties/${party.id}`, { name: 'Kaapattu' }],
      ['DELETE', `/parties/${party.id}`, undefined],
      ['POST', `/parties/${party.id}/invite-code`, undefined],
      ['DELETE', `/parties/${party.id}/members/${bob.id}`, undefined],
      ['PATCH', `/parties/${party.id}/members/${carol.id}`, { role: 'admin' }],
    ] as const) {
      expect((await call(carol, method, url, payload)).statusCode, `${method} ${url}`).toBe(404)
    }
    expect((await call(carol, 'GET', '/parties/not-a-uuid')).statusCode).toBe(404)
  })
})

describe('admin-only actions', () => {
  it('a member gets 403 for rename, delete, invite code and roles', async () => {
    const party = await partyWithAliceAndBob()
    for (const [method, url, payload] of [
      ['PATCH', `/parties/${party.id}`, { name: 'Uusi' }],
      ['DELETE', `/parties/${party.id}`, undefined],
      ['POST', `/parties/${party.id}/invite-code`, undefined],
      ['DELETE', `/parties/${party.id}/invite-code`, undefined],
      ['PATCH', `/parties/${party.id}/members/${alice.id}`, { role: 'member' }],
      ['DELETE', `/parties/${party.id}/members/${alice.id}`, undefined],
    ] as const) {
      expect((await call(bob, method, url, payload)).statusCode, `${method} ${url}`).toBe(403)
    }
  })

  it('an admin can rename', async () => {
    const party = await partyWithAliceAndBob()
    const response = await call(alice, 'PATCH', `/parties/${party.id}`, { name: 'Uusi nimi' })
    expect(response.json().party.name).toBe('Uusi nimi')
  })

  it('deleting a party keeps its sightings but makes them private', async () => {
    const party = await partyWithAliceAndBob()
    await call(bob, 'POST', '/sightings', {
      lat: 61, lng: 24, customSpecies: 'Metso', observedDate: '2026-09-20', partyId: party.id,
    })

    expect((await call(alice, 'DELETE', `/parties/${party.id}`)).statusCode).toBe(204)

    const sighting = await prisma.sighting.findFirstOrThrow()
    expect(sighting.partyId).toBeNull()
    expect((await call(bob, 'GET', '/sightings')).json().sightings).toHaveLength(1)
  })
})

describe('invite codes and joining', () => {
  it('shows the party on the join screen, and says if you are already a member', async () => {
    const party = await partyWithAliceAndBob()

    expect((await call(carol, 'GET', `/invites/${party.inviteCode}`)).json().invite).toEqual({
      partyId: party.id,
      partyName: 'Porukka',
      memberCount: 2,
      alreadyMember: false,
    })
    expect((await call(bob, 'GET', `/invites/${party.inviteCode}`)).json().invite.alreadyMember).toBe(true)
  })

  it('joining is idempotent and never changes an existing role', async () => {
    const party = await partyWithAliceAndBob()

    const again = await call(alice, 'POST', `/invites/${party.inviteCode}/join`)
    expect(again.json().party).toMatchObject({ id: party.id, myRole: 'admin', memberCount: 2 })
    expect(await prisma.huntingPartyMember.count()).toBe(2)
  })

  it('regenerating the code makes old links stop working', async () => {
    const party = await partyWithAliceAndBob()

    const { inviteCode } = (await call(alice, 'POST', `/parties/${party.id}/invite-code`)).json()
    expect(inviteCode).not.toBe(party.inviteCode)
    expect((await call(carol, 'POST', `/invites/${party.inviteCode}/join`)).statusCode).toBe(404)
    expect((await call(carol, 'POST', `/invites/${inviteCode}/join`)).statusCode).toBe(200)
  })

  it('disabling the code stops all joining', async () => {
    const party = await partyWithAliceAndBob()

    expect((await call(alice, 'DELETE', `/parties/${party.id}/invite-code`)).statusCode).toBe(204)
    expect((await call(carol, 'GET', `/invites/${party.inviteCode}`)).statusCode).toBe(404)
    expect((await call(carol, 'POST', `/invites/${party.inviteCode}/join`)).statusCode).toBe(404)
    expect((await call(alice, 'GET', `/parties/${party.id}`)).json().party.inviteCode).toBeNull()
  })

  it('an unknown code is 404', async () => {
    expect((await call(carol, 'GET', '/invites/eioleolemassa')).statusCode).toBe(404)
  })
})

describe('members and roles', () => {
  it('a member can leave; their shared items stay with the party', async () => {
    const party = await partyWithAliceAndBob()
    await call(bob, 'POST', '/sightings', {
      lat: 61, lng: 24, customSpecies: 'Metso', observedDate: '2026-09-20', partyId: party.id,
    })

    expect((await call(bob, 'DELETE', `/parties/${party.id}/members/${bob.id}`)).statusCode).toBe(204)

    expect((await call(alice, 'GET', '/sightings')).json().sightings).toHaveLength(1)
    expect((await call(bob, 'GET', '/parties')).json().parties).toEqual([])
  })

  it('an admin can remove a member', async () => {
    const party = await partyWithAliceAndBob()
    expect((await call(alice, 'DELETE', `/parties/${party.id}/members/${bob.id}`)).statusCode).toBe(204)
    expect(await prisma.huntingPartyMember.count()).toBe(1)
  })

  it("the last admin can't leave while others remain — until someone else is admin", async () => {
    const party = await partyWithAliceAndBob()

    const blocked = await call(alice, 'DELETE', `/parties/${party.id}/members/${alice.id}`)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error).toBe('last_admin')

    const promoted = await call(alice, 'PATCH', `/parties/${party.id}/members/${bob.id}`, { role: 'admin' })
    expect(promoted.json().party.members.map((m: { role: string }) => m.role)).toEqual(['admin', 'admin'])
    expect((await call(alice, 'DELETE', `/parties/${party.id}/members/${alice.id}`)).statusCode).toBe(204)
  })

  it("the last admin can't demote themselves", async () => {
    const party = await partyWithAliceAndBob()
    const response = await call(alice, 'PATCH', `/parties/${party.id}/members/${alice.id}`, { role: 'member' })
    expect(response.statusCode).toBe(409)
  })

  it('rejects an unknown role', async () => {
    const party = await partyWithAliceAndBob()
    const response = await call(alice, 'PATCH', `/parties/${party.id}/members/${bob.id}`, { role: 'owner' })
    expect(response.statusCode).toBe(400)
  })

  it('the last member leaving deletes the party', async () => {
    const created = (await call(alice, 'POST', '/parties', { name: 'Yksin' })).json().party

    expect((await call(alice, 'DELETE', `/parties/${created.id}/members/${alice.id}`)).statusCode).toBe(204)
    expect(await prisma.huntingParty.count()).toBe(0)
  })

  it('removing someone who is not a member is 404', async () => {
    const party = await partyWithAliceAndBob()
    expect((await call(alice, 'DELETE', `/parties/${party.id}/members/${carol.id}`)).statusCode).toBe(404)
  })

  it('two admins leaving at the same moment leave at least one admin behind', async () => {
    const party = await partyWithAliceAndBob()
    await call(alice, 'PATCH', `/parties/${party.id}/members/${bob.id}`, { role: 'admin' })
    const carolJoin = await call(carol, 'POST', `/invites/${party.inviteCode}/join`)
    expect(carolJoin.statusCode).toBe(200)

    const results = await Promise.all([
      call(alice, 'DELETE', `/parties/${party.id}/members/${alice.id}`),
      call(bob, 'DELETE', `/parties/${party.id}/members/${bob.id}`),
    ])

    // One succeeds; the other is retried after the conflict and refused.
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 409])
    expect(await prisma.huntingPartyMember.count({ where: { partyId: party.id, role: 'admin' } })).toBe(1)
  })
})
