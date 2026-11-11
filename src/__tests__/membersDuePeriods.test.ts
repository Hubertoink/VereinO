jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn(() => false) }))
jest.mock('../../electron/main/repositories/membershipLedger', () => ({ contributionStatus: jest.fn(() => ({ nextDue: '2026-09-01' })), contributionPeriods: jest.fn() }))

import { getDb } from '../../electron/main/db/database'
import { listDue } from '../../electron/main/repositories/members_payments'
import { contributionPeriods } from '../../electron/main/repositories/membershipLedger'

describe('all membership periods due through today', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'))
    ;(getDb as jest.Mock).mockReturnValue({
      prepare: () => ({ all: () => [{ id: 7, name: 'Test', status: 'ACTIVE' }] })
    })
    jest.mocked(contributionPeriods).mockImplementation((_id, through) => ['2026-09', '2026-10', '2026-11'].filter(key => key + '-01' <= through).map(key => ({ periodKey: key, interval: 'MONTHLY', dueDate: key + '-01', expected: 20, paidAmount: key === paidPeriod ? 20 : 0, remaining: key === paidPeriod ? 0 : 20 })))
    paidPeriod = null
  })
  afterEach(() => jest.useRealTimers())
  let paidPeriod: string | null = null

  it('includes September and October on October 1, but no future periods', () => {
    const result = listDue({ interval: 'MONTHLY', dueThroughToday: true })
    expect(result.rows.map(row => row.periodKey)).toEqual(['2026-09', '2026-10'])
  })

  it('excludes paid periods', () => {
    paidPeriod = '2026-09'
    expect(listDue({ interval: 'MONTHLY', dueThroughToday: true }).rows.map(row => row.periodKey)).toEqual(['2026-10'])
  })

  it('does not return monthly contributions for another interval', () => {
    expect(listDue({ interval: 'YEARLY', dueThroughToday: true }).rows).toEqual([])
  })
})
