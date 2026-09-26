import { afterEach, describe, expect, it, vi } from 'vitest'
import { HALF_HOUR_OPTIONS, nowRoundedTo30Min, todayIsoDate } from './dateTime'

afterEach(() => {
  vi.useRealTimers()
})

describe('dateTime', () => {
  it("todayIsoDate uses the local date, zero-padded", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59)) // local time
    expect(todayIsoDate()).toBe('2026-01-05')
  })

  it('nowRoundedTo30Min rounds down to the half hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 26, 7, 29))
    expect(nowRoundedTo30Min()).toBe('07:00')
    vi.setSystemTime(new Date(2026, 8, 26, 7, 30))
    expect(nowRoundedTo30Min()).toBe('07:30')
    vi.setSystemTime(new Date(2026, 8, 26, 23, 59))
    expect(nowRoundedTo30Min()).toBe('23:30')
  })

  it('HALF_HOUR_OPTIONS lists all 48 slots of a day in order', () => {
    expect(HALF_HOUR_OPTIONS).toHaveLength(48)
    expect(HALF_HOUR_OPTIONS.slice(0, 3)).toEqual(['00:00', '00:30', '01:00'])
    expect(HALF_HOUR_OPTIONS.at(-1)).toBe('23:30')
  })

  it('nowRoundedTo30Min always yields one of the select options', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 26, 13, 47))
    expect(HALF_HOUR_OPTIONS).toContain(nowRoundedTo30Min())
  })
})
