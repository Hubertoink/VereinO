jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn(() => false) }))

import { getDb } from '../../electron/main/db/database'
import { listDue } from '../../electron/main/repositories/members_payments'

describe('all membership periods due through today', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'))
    ;(getDb as jest.Mock).mockReturnValue({
      prepare: (sql: string) => sql.includes('FROM members m')
        ? { all: () => [{ id: 7, name: 'Test', amount: 20, interval: 'MONTHLY', nextDue: '2026-09-01', status: 'ACTIVE' }] }
        : { get: (_id: number, key: string) => key === paidPeriod ? { id: 1 } : undefined }
    })
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
