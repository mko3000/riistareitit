import type { FastifyInstance } from 'fastify'
import { Prisma, type User } from '@prisma/client'
import { prisma } from '../prisma.js'
import { hashPassword } from '../password.js'
import { createSession, setSessionCookie } from '../session.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

interface SignUpBody {
  email?: unknown
  displayName?: unknown
  password?: unknown
}

// Whitelist (not blacklist) the fields that leave the server — passwordHash
// must never appear in a response body.
function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/signup', async (request, reply) => {
    const body = request.body as SignUpBody

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const fieldErrors: Record<string, string> = {}
    if (!EMAIL_RE.test(email)) {
      fieldErrors.email = 'Enter a valid email address.'
    }
    if (!displayName) {
      fieldErrors.displayName = 'Display name is required.'
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      fieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    if (Object.keys(fieldErrors).length > 0) {
      return reply.status(400).send({ error: 'invalid_input', fieldErrors })
    }

    // Pre-check for a friendlier error than a raw constraint violation in
    // the common case; the P2002 catch below is the real guarantee (a
    // request racing this one could still slip past this check).
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply
        .status(409)
        .send({ error: 'email_taken', message: 'An account with this email already exists.' })
    }

    const passwordHash = await hashPassword(password)

    let user: User
    try {
      user = await prisma.user.create({ data: { email, displayName, passwordHash } })
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return reply
          .status(409)
          .send({ error: 'email_taken', message: 'An account with this email already exists.' })
      }
      throw err
    }

    const session = await createSession(user.id)
    setSessionCookie(reply, session)

    return reply.status(201).send({ user: toPublicUser(user) })
  })
}
