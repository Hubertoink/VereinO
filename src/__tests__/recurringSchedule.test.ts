import { addRecurringInterval, advanceRecurringSchedule } from '../../shared/recurrence'

describe('addRecurringInterval', () => {
  test('adds weekly, monthly, quarterly and yearly intervals', () => {
    expect(addRecurringInterval('2026-07-19', 'WEEKLY')).toBe('2026-07-26')
    expect(addRecurringInterval('2026-07-19', 'MONTHLY')).toBe('2026-08-19')
    expect(addRecurringInterval('2026-07-19', 'QUARTERLY')).toBe('2026-10-19')
    expect(addRecurringInterval('2026-07-19', 'YEARLY')).toBe('2027-07-19')
  })

  test('clamps month-end dates safely', () => {
    expect(addRecurringInterval('2026-01-31', 'MONTHLY')).toBe('2026-02-28')
    expect(addRecurringInterval('2026-02-28', 'MONTHLY', 31)).toBe('2026-03-31')
    expect(addRecurringInterval('2024-02-29', 'YEARLY')).toBe('2025-02-28')
  })
})

describe('advanceRecurringSchedule', () => {
  test('materializes every overdue occurrence and advances once', () => {
    expect(advanceRecurringSchedule({
      nextDueDate: '2026-01-31',
      throughDate: '2026-03-31',
      frequency: 'MONTHLY',
      anchorDay: 31
    })).toEqual({
      dueDates: ['2026-01-31', '2026-02-28', '2026-03-31'],
      nextDueDate: '2026-04-30',
      ended: false
    })
  })

  test('stops after the configured end date', () => {
    expect(advanceRecurringSchedule({
      nextDueDate: '2026-01-01',
      throughDate: '2026-12-31',
      frequency: 'QUARTERLY',
      anchorDay: 1,
      endDate: '2026-06-30'
    })).toEqual({
      dueDates: ['2026-01-01', '2026-04-01'],
      nextDueDate: '2026-07-01',
      ended: true
    })
  })
})
