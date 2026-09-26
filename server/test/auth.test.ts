import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/prisma.js'
import { createTestApp, resetDatabase, sessionCookie, signUpUser } from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(resetDatabase)

function postSignup(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/signup', payload })
}

describe('POST /signup', () => {
  it('creates the user, signs them in, and never returns the password hash', async () => {
    const response = await postSignup({ email: '  Miko@Example.TEST ', displayName: 'Miko', password: 'salasana123' })

    expect(response.statusCode).toBe(201)
    const { user } = response.json()
    expect(user).toMatchObject({ email: 'miko@example.test', displayName: 'Miko', role: 'member' })
    expect(response.body).not.toContain('passwordHash')
    expect(response.body).not.toContain('salasana123')

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).not.toBe('salasana123')

    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie: sessionCookie(response.cookies) } })
    expect(me.json().user.id).toBe(user.id)
  })

  it('returns per-field errors for invalid input', async () => {
    const response = await postSignup({ email: 'not-an-email', displayName: '  ', password: 'short' })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_input')
    expect(Object.keys(response.json().fieldErrors).sort()).toEqual(['displayName', 'email', 'password'])
  })

  it('rejects an email that is already registered, case-insensitively', async () => {
    await postSignup({ email: 'miko@example.test', displayName: 'Miko', password: 'salasana123' })
    const response = await postSignup({ email: 'MIKO@example.test', displayName: 'Toinen', password: 'salasana123' })

    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('email_taken')
  })
})

describe('POST /login', () => {
  beforeEach(async () => {
    await postSignup({ email: 'miko@example.test', displayName: 'Miko', password: 'salasana123' })
  })

  it('logs in with the right password and sets a session cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'Miko@example.test', password: 'salasana123' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().user.displayName).toBe('Miko')
    expect(sessionCookie(response.cookies)).toMatch(/^session_id=/)
  })

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'miko@example.test', password: 'väärä-salasana' },
    })
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nobody@example.test', password: 'salasana123' },
    })

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('invalid_credentials')
    }
    expect(wrongPassword.body).toBe(unknownEmail.body)
  })
})

describe('GET /me and POST /logout', () => {
  it('returns user null when not logged in', async () => {
    const response = await app.inject({ method: 'GET', url: '/me' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user: null })
  })

  it('logout deletes the session server-side, so the old cookie stops working', async () => {
    const user = await signUpUser(app)

    const logout = await app.inject({ method: 'POST', url: '/logout', headers: { cookie: user.cookie } })
    expect(logout.statusCode).toBe(204)

    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie: user.cookie } })
    expect(me.json()).toEqual({ user: null })
    expect(await prisma.session.count()).toBe(0)
  })

  it('ignores an expired session', async () => {
    const user = await signUpUser(app)
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })

    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie: user.cookie } })
    expect(me.json()).toEqual({ user: null })
  })
})

describe('GET /health', () => {
  it('reports the database as connected', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.json()).toEqual({ status: 'ok', db: 'connected' })
  })
})
