import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './env.js'
import { prisma } from './prisma.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: env.webOrigin, credentials: true })

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
