import { prisma } from '../prisma.js'

// RII-47: sightings created anonymously before login became required
// (RII-43) have no creator and no party, so under the visibility rules
// (docs/SPEC.md §9) no one sees them. These helpers give them to one
// account. Used by scripts/assign-orphan-sightings.ts, run by hand.

// Same normalization as signup/login: trimmed, lowercased.
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, displayName: true },
  })
}

export async function listOrphanSightings() {
  return prisma.sighting.findMany({
    where: { createdByUserId: null },
    select: { id: true, observedDate: true, kind: true, customSpecies: true, species: { select: { nameFi: true } } },
    orderBy: { observedDate: 'asc' },
  })
}

// Sets the creator on every sighting that has none — nothing else changes.
// Idempotent: once they're assigned there's nothing left to match.
export async function assignOrphanSightings(userId: string): Promise<number> {
  const result = await prisma.sighting.updateMany({
    where: { createdByUserId: null },
    data: { createdByUserId: userId },
  })
  return result.count
}
