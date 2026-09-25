import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// RII-20: the four required presets (Finnish names, per docs/SPEC.md §4).
// `icon` is a placeholder equal to `key` for now — real per-species icons
// are RII-5's job, not this ticket's.
const PRESET_SPECIES = [
  { key: 'metso', nameFi: 'Metso' },
  { key: 'teeri', nameFi: 'Teeri' },
  { key: 'pyy', nameFi: 'Pyy' },
  { key: 'riekko', nameFi: 'Riekko' },
]

async function main() {
  for (const species of PRESET_SPECIES) {
    await prisma.species.upsert({
      where: { key: species.key },
      update: { nameFi: species.nameFi },
      create: { ...species, icon: species.key, isPreset: true },
    })
  }
  console.log(`Seeded ${PRESET_SPECIES.length} preset species.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
