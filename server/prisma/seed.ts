import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// RII-20: the four required presets, per docs/SPEC.md §4.
// `key` is an English identifier — code (RII-22's species-picker buttons)
// matches against this, so it stays English regardless of UI language, per
// "all code in English, UI in Finnish" (Miko, 2026-09-25). `nameFi` is what
// the UI actually shows for now (RII-7); `nameEn` is filled in already even
// though nothing reads it until RII-14 (English toggle) — no reason to
// re-derive the same English names later when we already need them here to
// pick sensible keys.
// `icon` equals `key` — it's the id the frontend's icon registry
// (src/sightings/speciesIcons.ts, RII-5) looks each silhouette up by.
const PRESET_SPECIES = [
  { key: 'capercaillie', nameFi: 'Metso', nameEn: 'Capercaillie' },
  { key: 'black-grouse', nameFi: 'Teeri', nameEn: 'Black grouse' },
  { key: 'hazel-grouse', nameFi: 'Pyy', nameEn: 'Hazel grouse' },
  { key: 'willow-ptarmigan', nameFi: 'Riekko', nameEn: 'Willow ptarmigan' },
]

async function main() {
  for (const species of PRESET_SPECIES) {
    await prisma.species.upsert({
      where: { key: species.key },
      update: { nameFi: species.nameFi, nameEn: species.nameEn },
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
