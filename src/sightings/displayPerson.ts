import { t } from '../i18n'

// `personDisplay` stores the code-facing sentinel 'unknown' when nobody is
// named (RII-20); the UI shows it in Finnish (RII-7).
export function displayPerson(personDisplay: string): string {
  return personDisplay === 'unknown' ? t.sightings.unknownPerson : personDisplay
}
