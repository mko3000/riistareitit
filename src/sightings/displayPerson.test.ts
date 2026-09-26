import { describe, expect, it } from 'vitest'
import { displayPerson } from './displayPerson'

describe('displayPerson', () => {
  it("shows the stored 'unknown' sentinel in Finnish", () => {
    expect(displayPerson('unknown')).toBe('Tuntematon')
  })

  it('shows real names as-is', () => {
    expect(displayPerson('Miko')).toBe('Miko')
  })
})
