const mockPrepare = jest.fn((sql: string) => {
  if (sql.includes('FROM vouchers')) {
    return { get: jest.fn(() => ({ inGross: 100, outGross: 40 })) }
  }
  if (sql.includes('FROM members')) {
    return { get: jest.fn(() => ({ total: 5, active: 3, new: 1, paused: 1, left: 0 })) }
  }
  if (sql.includes('WITH invoice_state')) {
    return { get: jest.fn(() => ({ openCount: 2, openRemaining: 75, dueSoonCount: 1, dueSoonRemaining: 25, overdueCount: 1, overdueRemaining: 50 })) }
  }
  if (sql.includes('FROM invoices')) {
    return { all: jest.fn(() => [{ id: 3, party: 'Lieferant', dueDate: '2026-07-12', remaining: 50 }]) }
  }
  if (sql.includes('FROM bank_transactions')) {
    return { get: jest.fn(() => ({ count: 2 })) }
  }
  if (sql.includes('FROM submissions')) {
    return { get: jest.fn(() => ({ count: 1 })) }
  }
  if (sql.includes('FROM settings')) {
    return { all: jest.fn(() => [{ key: 'org.cashier', valueJson: '"Merle"' }]) }
  }
  if (sql.includes('FROM budgets')) return { all: jest.fn(() => []) }
  if (sql.includes('FROM earmarks')) return { all: jest.fn(() => []) }
  throw new Error(`Unexpected query: ${sql}`)
})

jest.mock('../../db/database', () => ({
  getCurrentDbInfo: jest.fn(() => ({ dbPath: 'C:/test/database.sqlite' })),
  getDb: jest.fn(() => ({ prepare: mockPrepare }))
}))
jest.mock('../../repositories/members_payments', () => ({
  dueSummary: jest.fn(() => ({ dueMembers: 1, duePeriods: 2 }))
}))
jest.mock('../../repositories/bankTransactions', () => ({
  getBankImportStatus: jest.fn(() => ({ lastBookingDate: '2026-06-30', lastImportAt: '2026-07-01 10:00:00', total: 4 }))
}))
jest.mock('../../repositories/vouchers', () => ({
  listVoucherYears: jest.fn(() => [2026, 2025])
}))
jest.mock('../settings', () => ({
  getSetting: jest.fn((key: string) => key === 'org.cashier' ? 'Merle' : '')
}))

import { clearDashboardSnapshotCache, getDashboardSnapshot } from '../dashboardSnapshot'

describe('dashboard snapshot cache', () => {
  const input = { from: '2026-01-01', to: '2026-07-13', today: '2026-07-13' }

  beforeEach(() => {
    mockPrepare.mockClear()
    clearDashboardSnapshotCache()
  })

  it('reuses snapshots and invalidates them only for relevant data changes', () => {
    const first = getDashboardSnapshot(input)
    const queryCount = mockPrepare.mock.calls.length

    expect(first.financial).toEqual({ inGross: 100, outGross: 40, diff: 60 })
    expect(first.members.total).toBe(5)
    expect(getDashboardSnapshot(input)).toBe(first)
    expect(mockPrepare).toHaveBeenCalledTimes(queryCount)

    clearDashboardSnapshotCache(['tags'])
    expect(getDashboardSnapshot(input)).toBe(first)

    clearDashboardSnapshotCache(['vouchers'])
    expect(getDashboardSnapshot(input)).not.toBe(first)
    expect(mockPrepare.mock.calls.length).toBeGreaterThan(queryCount)
  })
})
