import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { env } from './env.js'
import { prisma } from './prisma.js'
import authRoutes from './routes/auth.js'
import sightingsRoutes from './routes/sightings.js'

const app = Fastify({ logger: true })

const isProduction = process.env.NODE_ENV === 'production'
// Vite happily picks a different port than 5173 if something else already
// holds it, which used to break CORS until WEB_ORIGIN was manually updated
// to match. In dev, accept any localhost/127.0.0.1 origin regardless of
// port; production still requires an exact match against WEB_ORIGIN.
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/

// Found during RII-22 manual testing: an unhandled error (e.g. a missing
// migration) was reaching the browser as a raw Prisma stack trace, since
// Fastify's default error handler echoes the thrown error's own message.
// Log the real error server-side; never leak internals to the client.
//
// Must be set before registering the route plugins below, not after: a
// custom error handler only propagates into a plugin's encapsulated
// context if it was set before that plugin was registered, not
// retroactively — confirmed the hard way, this silently did nothing when
// it was below the app.register() calls instead of above them.
app.setErrorHandler((err: Error & { statusCode?: number }, _request, reply) => {
  app.log.error(err)
  const status = err.statusCode ?? 500
  reply.status(status).send({ error: 'internal_error', message: 'Something went wrong. Please try again.' })
})

await app.register(cors, {
  credentials: true,
  origin: isProduction
    ? env.webOrigin
    : (origin, callback) => {
        callback(null, !origin || LOCAL_ORIGIN_RE.test(origin))
      },
})
await app.register(cookie)
await app.register(authRoutes)
await app.register(sightingsRoutes)

// Proves the API is up and can actually reach Postgres, not just that the
// process is running.
app.get('/health', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', db: 'connected' }
  } catch (err) {
    app.log.error(err, 'Health check failed to reach the database')
    return reply.status(503).send({ status: 'error', db: 'unreachable' })
  }
})

try {
  await app.listen({ port: env.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
