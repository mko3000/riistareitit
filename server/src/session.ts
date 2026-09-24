import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'
import type { User } from '@prisma/client'

// Shared session mechanism. Built as part of RII-29 (sign-up needs to "sign
// the user in immediately"); RII-30 adds the login/logout/me endpoints on
// top of this same module. See prisma/schema.prisma's `Session` model for
// why this is a server-side session row, not a stateless signed cookie.

export const SESSION_COOKIE_NAME = 'session_id'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  return prisma.session.create({ data: { userId, expiresAt } })
}

export function setSessionCookie(reply: FastifyReply, session: { id: string; expiresAt: Date }) {
  reply.setCookie(SESSION_COOKIE_NAME, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Dev runs over plain http; only require the Secure flag once deployed
    // behind https.
    secure: process.env.NODE_ENV === 'production',
    expires: session.expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
}

// Not used by RII-29 itself — provided for RII-30's `/me` and future
// auth-gated routes to build on, so the session module is complete rather
// than half-shipped.
export async function getSessionUser(request: FastifyRequest): Promise<User | null> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME]
  if (!sessionId) return null

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  })
  if (!session || session.expiresAt.getTime() < Date.now()) return null

  return session.user
}
