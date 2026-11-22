import type Database from 'better-sqlite3'
import { getDb, withTransaction } from '../../../electron/main/db/database'
import { applyMigrations } from '../../../electron/main/db/migrations'

export function openTestLedger(): Database.Database {
  const db: Database.Database = new (require('node:sqlite').DatabaseSync)(':memory:')
  // node:sqlite implements savepoints, but does not expose better-sqlite3's transaction wrapper.
  let sequence = 0
  Object.assign(db, { transaction: <T, A extends unknown[]>(fn: (...args: A) => T) => (...args: A) => {
    const name = 'ledger_test_' + ++sequence
    db.exec('SAVEPOINT ' + name)
    try {
      const result = fn(...args)
      db.exec('RELEASE ' + name)
      return result
    } catch (error) {
      db.exec('ROLLBACK TO ' + name)
      db.exec('RELEASE ' + name)
      throw error
    }
  } })
  jest.mocked(getDb).mockReturnValue(db)
  jest.mocked(withTransaction).mockImplementation(fn => db.transaction(() => fn(db))())
  applyMigrations(db)
  return db
}
