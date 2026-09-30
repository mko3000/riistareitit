import { t } from '../i18n'

// RII-46: who sees a sighting/track — a party id, or null for "Vain minä"
// (private). See docs/SPEC.md §9 "UI" ("Näkyy" picker).

export type Visibility = string | null

const STORAGE_KEY = 'riistareitit.visibility'
const PRIVATE = 'private'

// The default for new items: the last choice, if it's still one of my
// parties — otherwise private. Never silently some other party.
export function readDefaultVisibility(myPartyIds: string[]): Visibility {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored && stored !== PRIVATE && myPartyIds.includes(stored) ? stored : null
  } catch {
    return null
  }
}

export function storeDefaultVisibility(visibility: Visibility): void {
  try {
    localStorage.setItem(STORAGE_KEY, visibility ?? PRIVATE)
  } catch {
    // Not remembered this time; the next default is just private.
  }
}

// Label for popups: the party's name, "vain minä", or — for my own item in
// a party I've since left — a note that I'm no longer in it.
export function visibilityName(visibility: Visibility, myParties: Array<{ id: string; name: string }>): string {
  if (visibility === null) return t.visibility.private
  return myParties.find((party) => party.id === visibility)?.name ?? t.visibility.leftParty
}
