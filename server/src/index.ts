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
