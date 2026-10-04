jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn(() => false) }))

import { getDb } from '../../electron/main/db/database'
import { memberLetterContributionParagraphs } from '../../electron/main/services/memberLetter'

describe('membership contribution letter', () => {
  let member: {
    id: number; contribution_interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | null;
    contribution_amount: number; next_due_date: string; join_date: string; leave_date: string | null
  }
  let paidPeriods: Set<string>

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T12:00:00Z'))
    member = {
      id: 7, contribution_interval: 'MONTHLY', contribution_amount: 10,
      next_due_date: '2026-07-01', join_date: '2026-01-11', leave_date: null
    }
    paidPeriods = new Set(['2026-10'])
    ;(getDb as jest.Mock).mockReturnValue({
      prepare: (sql: string) => {
        if (sql.includes('FROM members WHERE id')) return { get: () => member }
        if (sql.includes('WHERE member_id IN')) return {
          all: () => [...paidPeriods].map(periodKey => ({ memberId: member.id, periodKey }))
        }
        if (sql.includes('FROM members m')) return {
          all: (id: number) => id === member.id ? [{
            id: member.id, amount: member.contribution_amount, interval: member.contribution_interval,
            nextDue: member.next_due_date, joinDate: member.join_date, leaveDate: member.leave_date
          }] : []
        }
        if (sql.includes('AND period_key = ?')) return {
          get: (_id: number, period: string) => paidPeriods.has(period) ? { id: 1 } : undefined
        }
        throw new Error(`Unexpected query: ${sql}`)
      }
    })
  })

  afterEach(() => jest.useRealTimers())

  const text = () => memberLetterContributionParagraphs(member.id).join('\n').replace(/\u00a0/g, ' ')

  it('lists the three unpaid months with individual amounts and the total, excluding paid and future periods', () => {
    expect(text()).toContain('Juli 2026: 10,00 €\nAugust 2026: 10,00 €\nSeptember 2026: 10,00 €')
    expect(text()).toContain('Offener Gesamtbetrag: 30,00 €')
    expect(text()).not.toMatch(/Oktober|November|Dezember/)
  })

  it('refreshes the outstanding contributions when a payment is recorded before the next letter', () => {
    expect(text()).toContain('Offener Gesamtbetrag: 30,00 €')
    paidPeriods.add('2026-07')
    expect(text()).not.toContain('Juli 2026')
    expect(text()).toContain('Offener Gesamtbetrag: 20,00 €')
  })

  it('labels quarterly contributions and includes the current unpaid period as in the contribution dialog', () => {
    member.contribution_interval = 'QUARTERLY'
    member.contribution_amount = 25.55
    paidPeriods = new Set()
    expect(text()).toContain('3. Quartal 2026: 25,55 €\n4. Quartal 2026: 25,55 €')
    expect(text()).toContain('Offener Gesamtbetrag: 51,10 €')
    expect(text()).not.toContain('2027')
  })

  it('labels annual contributions and stops at the membership leave date', () => {
    member.contribution_interval = 'YEARLY'
    member.contribution_amount = 100
    member.next_due_date = '2024-01-01'
    member.join_date = '2024-01-01'
    member.leave_date = '2025-12-31'
    paidPeriods = new Set(['2024'])
    expect(text()).toContain('2025: 100,00 €')
    expect(text()).toContain('Offener Gesamtbetrag: 100,00 €')
    expect(text()).not.toMatch(/2024:|2026:/)
  })

  it('does not add a payment request when all due contributions are paid', () => {
    paidPeriods = new Set(['2026-07', '2026-08', '2026-09', '2026-10'])
    expect(memberLetterContributionParagraphs(member.id)).toEqual([])
  })

  it('keeps the general letter when no contribution plan or member ID is available', () => {
    member.contribution_interval = null
    expect(memberLetterContributionParagraphs(member.id)).toEqual([])
    expect(memberLetterContributionParagraphs()).toEqual([])
  })
})
