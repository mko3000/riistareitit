import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  // RII-6: optional — without it the map tiles route answers 503 and the
  // rest of the server works normally. Read on each access (a getter) so
  // tests can change it.
  get mmlApiKey(): string | undefined {
    return process.env.MML_API_KEY || undefined
  },
}
