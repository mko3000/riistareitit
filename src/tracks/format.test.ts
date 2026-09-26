import { describe, expect, it } from 'vitest'
import { formatFinnishDate, formatKm } from './format'

describe('Finnish formatting', () => {
  it('formats dates as d.m.yyyy without leading zeros', () => {
    expect(formatFinnishDate('2026-09-05')).toBe('5.9.2026')
  })

  it('formats km with one decimal and a decimal comma', () => {
    expect(formatKm(2054)).toBe('2,1 km')
    expect(formatKm(0)).toBe('0,0 km')
  })
})
