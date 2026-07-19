import { recurringPeriodDescription } from '../../shared/recurrence'

describe('recurringPeriodDescription', () => {
  it('adds the applicable period for monthly, quarterly and yearly bookings', () => {
    expect(recurringPeriodDescription('Zeitungsabo', 'MONTHLY', '2026-07-19')).toBe('Zeitungsabo (Juli 2026)')
    expect(recurringPeriodDescription('Verbandsbeitrag', 'QUARTERLY', '2026-07-19')).toBe('Verbandsbeitrag (Q3 2026)')
    expect(recurringPeriodDescription('Versicherung', 'YEARLY', '2026-07-19')).toBe('Versicherung (2026)')
  })

  it('adds the ISO calendar week for weekly bookings', () => {
    expect(recurringPeriodDescription('Platzpflege', 'WEEKLY', '2026-06-01')).toBe('Platzpflege (KW 23 2026)')
    expect(recurringPeriodDescription('Platzpflege', 'WEEKLY', '2027-01-01')).toBe('Platzpflege (KW 53 2026)')
  })
})
