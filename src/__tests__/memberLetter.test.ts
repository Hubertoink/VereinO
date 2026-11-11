jest.mock('../../electron/main/repositories/members_payments', () => ({ status: jest.fn(), listDue: jest.fn() }))

import { status, listDue } from '../../electron/main/repositories/members_payments'
import { memberLetterContributionParagraphs } from '../../electron/main/services/memberLetter'

describe('membership contribution letter', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T12:00:00Z'))
    jest.mocked(status).mockReturnValue({ hasPlan: true, interval: 'MONTHLY', nextDue: '2026-07-01', joinDate: '2026-01-11' } as any)
    due([['2026-07', 10], ['2026-08', 10], ['2026-09', 10]])
  })
  afterEach(() => jest.useRealTimers())
  function due(periods: Array<[string, number]>) {
    jest.mocked(listDue).mockReturnValue({ rows: periods.map(([periodKey, amount]) => ({ periodKey, amount })), total: periods.length })
  }
  const text = () => memberLetterContributionParagraphs(7).join('\n').replace(/\u00a0/g, ' ')

  it('lists outstanding periods and requests only unpaid contributions through today', () => {
    expect(text()).toContain('Juli 2026: 10,00 €\nAugust 2026: 10,00 €\nSeptember 2026: 10,00 €')
    expect(text()).toContain('Offener Gesamtbetrag: 30,00 €')
    expect(listDue).toHaveBeenLastCalledWith({ memberId: 7, interval: 'MONTHLY', from: '2026-07-01', to: '2026-10-04', includePaid: false })
  })

  it('refreshes outstanding contributions for every new letter', () => {
    expect(text()).toContain('Offener Gesamtbetrag: 30,00 €')
    due([['2026-08', 10], ['2026-09', 10]])
    expect(text()).not.toContain('Juli 2026')
    expect(text()).toContain('Offener Gesamtbetrag: 20,00 €')
  })

  it('requests only the remaining amount of a partially paid period', () => {
    due([['2026-07', 4], ['2026-08', 10]])
    expect(text()).toContain('Juli 2026: 4,00 €')
    expect(text()).toContain('Offener Gesamtbetrag: 14,00 €')
  })

  it('labels quarterly contributions and sums cents accurately', () => {
    jest.mocked(status).mockReturnValue({ hasPlan: true, interval: 'QUARTERLY', nextDue: '2026-07-01' } as any)
    due([['2026-Q3', 25.55], ['2026-Q4', 25.55]])
    expect(text()).toContain('3. Quartal 2026: 25,55 €\n4. Quartal 2026: 25,55 €')
    expect(text()).toContain('Offener Gesamtbetrag: 51,10 €')
  })

  it('labels annual contributions returned by the ledger', () => {
    jest.mocked(status).mockReturnValue({ hasPlan: true, interval: 'YEARLY', nextDue: '2025-01-01' } as any)
    due([['2025', 100]])
    expect(text()).toContain('2025: 100,00 €')
    expect(text()).toContain('Offener Gesamtbetrag: 100,00 €')
  })

  it('does not add a payment request when all due contributions are paid', () => {
    due([])
    expect(memberLetterContributionParagraphs(7)).toEqual([])
  })

  it('keeps the general letter when no contribution plan or member ID is available', () => {
    jest.mocked(status).mockReturnValue({ hasPlan: false } as any)
    expect(memberLetterContributionParagraphs(7)).toEqual([])
    expect(memberLetterContributionParagraphs()).toEqual([])
  })
})
