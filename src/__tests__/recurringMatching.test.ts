import { recurringGrossAmount, scoreRecurringMatch } from '../../shared/recurringMatching'

describe('recurringGrossAmount', () => {
  it('converts net recurring amounts to the bank-visible gross amount', () => {
    expect(recurringGrossAmount('NET', 10, 19)).toBe(11.9)
    expect(recurringGrossAmount('GROSS', 14, 0)).toBe(14)
  })
})

describe('scoreRecurringMatch', () => {
  const base = {
    scheduledDate: '2026-08-19',
    bookingDate: '2026-08-20',
    recurringType: 'OUT' as const,
    bookingType: 'OUT' as const,
    expectedGrossAmount: 14,
    bookingGrossAmount: 14,
    recurringPaymentAccountId: 2,
    bookingPaymentAccountId: 2,
    recurringText: 'Canva Abo Canva',
    bookingText: 'CANVA* Monatsabo'
  }

  it('finds a compatible subscription independently of the creation order', () => {
    const match = scoreRecurringMatch(base)
    expect(match).toEqual(expect.objectContaining({ amountMatches: true }))
    expect(match?.score).toBeGreaterThanOrEqual(80)
  })

  it('rejects wrong accounts, directions, dates and fixed amounts', () => {
    expect(scoreRecurringMatch({ ...base, bookingPaymentAccountId: 3 })).toBeNull()
    expect(scoreRecurringMatch({ ...base, bookingType: 'IN' })).toBeNull()
    expect(scoreRecurringMatch({ ...base, bookingDate: '2026-09-10' })).toBeNull()
    expect(scoreRecurringMatch({ ...base, bookingGrossAmount: 15 })).toBeNull()
  })

  it('allows changed amounts only for variable recurring bookings', () => {
    expect(scoreRecurringMatch({ ...base, bookingGrossAmount: 15, variableAmount: true }))
      .toEqual(expect.objectContaining({ amountMatches: false }))
  })
})
