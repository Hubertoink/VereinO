jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))

import { getDb, withTransaction } from '../../electron/main/db/database'
import { upsertBudget } from '../../electron/main/repositories/budgets'

function setup(profile: 'GENERAL' | 'NONPROFIT', classification?: { id: number; stableKey: string; isActive: number }) {
  const run = jest.fn<{ lastInsertRowid: number }, unknown[]>(() => ({ lastInsertRowid: 14 }))
  const db = { prepare: (sql: string) => ({ get: () => sql.includes('FROM organization_profile') ? { profile } : classification, run }) }
  jest.mocked(getDb).mockReturnValue(db as any)
  jest.mocked(withTransaction).mockImplementation(fn => fn(db as any))
  return run
}

it.each([undefined, 14])('saves a GENERAL budget without a booking category (id=%s)', id => {
  const run = setup('GENERAL')
  expect(upsertBudget({ id, year: 2026, sphere: 'IDEELL', name: 'Jugendarbeit', amountPlanned: 1000, categoryName: 'Material' }).id).toBe(14)
  expect(run.mock.calls[0][2]).toBeNull()
})

it('keeps validating an explicitly supplied legacy category', () => {
  const run = setup('GENERAL')
  expect(() => upsertBudget({ year: 2026, sphere: 'IDEELL', amountPlanned: 1000, primaryClassificationValueId: 99 })).toThrow(/Kategorie/i)
  expect(run).not.toHaveBeenCalled()
})

it('keeps resolving nonprofit spheres', () => {
  const run = setup('NONPROFIT', { id: 3, stableKey: 'IDEELL', isActive: 1 })
  upsertBudget({ year: 2026, sphere: 'IDEELL', amountPlanned: 1000 })
  expect(run.mock.calls[0][2]).toBe(3)
})
