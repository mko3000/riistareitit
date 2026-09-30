// RII-47: one-off, run by hand. Gives anonymous legacy sightings (no
// creator) to an account so they're visible again. See docs/SPEC.md §9
// "Migration of existing data" and server/README.md.
//
//   npm run assign-orphan-sightings -- <email> [--yes]

import { createInterface } from 'node:readline/promises'
import { env } from '../src/env.js'
import { formatDate } from '../src/routes/sightings.js'
import { assignOrphanSightings, findUserByEmail, listOrphanSightings } from '../src/maintenance/assignOrphanSightings.js'
import { prisma } from '../src/prisma.js'

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const yes = args.includes('--yes')
  const email = args.find((arg) => !arg.startsWith('--'))
  if (!email) {
    console.error('Usage: npm run assign-orphan-sightings -- <email> [--yes]')
    return 2
  }

  // Say which database this is about to change — never the password.
  const url = new URL(env.databaseUrl)
  console.log(`Database: ${url.hostname}:${url.port}${url.pathname}`)

  const user = await findUserByEmail(email)
  if (!user) {
    console.error(`No account with email ${email}. Nothing changed.`)
    return 1
  }

  const orphans = await listOrphanSightings()
  if (orphans.length === 0) {
    console.log('No sightings without a creator. Nothing to do.')
    return 0
  }

  console.log(`${orphans.length} sighting(s) without a creator:`)
  for (const sighting of orphans) {
    const species = sighting.species?.nameFi ?? sighting.customSpecies ?? '?'
    console.log(`  ${formatDate(sighting.observedDate)}  ${sighting.kind.padEnd(8)}  ${species}`)
  }

  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(
      `Assign them to ${user.displayName} <${user.email}>? They become private to that account. [y/N] `,
    )
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Cancelled. Nothing changed.')
      return 0
    }
  }

  const count = await assignOrphanSightings(user.id)
  console.log(`Assigned ${count} sighting(s) to ${user.displayName}.`)
  return 0
}

main()
  .then(async (code) => {
    await prisma.$disconnect()
    process.exit(code)
  })
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
