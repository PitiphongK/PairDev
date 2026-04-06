import {
  calculateRoleTotals,
  computeSessionSummary,
  electOwner,
  formatDuration,
  formatPercentage,
  getDefaultRole,
  isAnalyticsEntry,
  isNumberArray,
  parseAnalyticsEntry,
  pickRandomOwner,
  updateRoleTotalsOnChange,
} from '@/utils/editor'
import { describe, expect, it } from 'vitest'

describe('editor utils', () => {
  it('validates arrays and analytics entries', () => {
    expect(isNumberArray([1, 2, 3])).toBe(true)
    expect(isNumberArray([1, 'x'])).toBe(false)

    expect(isAnalyticsEntry({ driverMs: 1, navigatorMs: 2, noneMs: 3 })).toBe(
      true
    )
    expect(isAnalyticsEntry({ driverMs: 1, navigatorMs: '2', noneMs: 3 })).toBe(
      false
    )
  })

  it('calculates totals with in-progress role tracking', () => {
    const totals = calculateRoleTotals(
      { driver: 1000, navigator: 500, none: 250 },
      { role: 'driver', startedAt: 1000 },
      1600
    )

    expect(totals).toEqual({ driver: 1600, navigator: 500, none: 250 })
  })

  it('computes session summary and returns null when session has not started', () => {
    expect(computeSessionSummary(null, { driver: 0, navigator: 0, none: 0 }, null, 1000)).toBeNull()

    const summary = computeSessionSummary(
      1000,
      { driver: 100, navigator: 200, none: 0 },
      { role: 'navigator', startedAt: 1400 },
      2000
    )

    expect(summary).toEqual({
      sessionMs: 1000,
      driverMs: 100,
      navigatorMs: 800,
      noneMs: 0,
    })
  })

  it('updates totals on role change', () => {
    const updated = updateRoleTotalsOnChange(
      { driver: 10, navigator: 20, none: 30 },
      { role: 'navigator', startedAt: 1000 },
      1300
    )
    expect(updated).toEqual({ driver: 10, navigator: 320, none: 30 })
  })

  it('parses analytics safely', () => {
    expect(parseAnalyticsEntry({ driverMs: 10, navigatorMs: 20, noneMs: 30 })).toEqual({
      driverMs: 10,
      navigatorMs: 20,
      noneMs: 30,
    })

    expect(parseAnalyticsEntry({ driverMs: 10 })).toEqual({
      driverMs: 10,
      navigatorMs: 0,
      noneMs: 0,
    })
  })

  it('formats durations and percentages', () => {
    expect(formatDuration(45000)).toBe('45s')
    expect(formatDuration(125000)).toBe('2m 5s')
    expect(formatDuration(3661000)).toBe('1h 1m 1s')

    expect(formatPercentage(0.256)).toBe('26%')
  })

  it('handles owner election and role defaults', () => {
    expect(electOwner([42, 7, 13], 99)).toBe(7)
    expect(electOwner([], 99)).toBe(99)

    const choice = pickRandomOwner([5, 6, 7])
    expect([5, 6, 7]).toContain(choice)
    expect(pickRandomOwner([])).toBeNull()

    expect(getDefaultRole(true)).toBe('driver')
    expect(getDefaultRole(false)).toBe('navigator')
  })
})
