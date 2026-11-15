jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))

import { getDb } from '../../electron/main/db/database'
import { deletePaymentAccount, listPaymentAccounts } from '../../electron/main/repositories/paymentAccounts'
import { PaymentAccountsListOutput } from '../../electron/main/ipc/schemas'

const Sqlite = require('node:sqlite').DatabaseSync
let db: any

beforeEach(() => {
  db = new Sqlite(':memory:')
  db.exec(`
    CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, iban TEXT,
      color TEXT, sort_order INTEGER, is_active INTEGER);
    CREATE TABLE vouchers (id INTEGER PRIMARY KEY, payment_account_id INTEGER,
      transfer_from_account_id INTEGER, transfer_to_account_id INTEGER);
    INSERT INTO payment_accounts VALUES
      (1, 'Hauptkonto', 'BANK', NULL, NULL, 1, 1),
      (2, 'Kasse', 'CASH', NULL, NULL, 2, 1),
      (3, 'Bank', 'BANK', NULL, NULL, 3, 1),
      (4, 'Altbestand', 'BANK', NULL, NULL, 4, 0);
    INSERT INTO vouchers VALUES
      (1, 1, NULL, NULL), (2, 1, NULL, NULL),
      (3, NULL, 1, 2), (4, 1, 1, 2), (5, 4, NULL, NULL);
  `)
  jest.mocked(getDb).mockReturnValue(db)
})

afterEach(() => db.close())

test('counts assigned bookings and both transfer endpoints once per account across the IPC schema', () => {
  const { rows } = PaymentAccountsListOutput.parse({ rows: listPaymentAccounts() })
  expect(rows.map(({ id, bookingCount }) => [id, bookingCount])).toEqual([[1, 4], [2, 2], [3, 0], [4, 1]])
  expect(listPaymentAccounts({ activeOnly: true }).map(row => row.id)).toEqual([1, 2, 3])
})

test('allows deleting unused default accounts but protects accounts used only in transfers', () => {
  expect(deletePaymentAccount(3)).toEqual({ id: 3 })
  expect(listPaymentAccounts().map(row => row.id)).not.toContain(3)
  expect(() => deletePaymentAccount(1)).toThrow('bereits in Buchungen verwendet')
  expect(() => deletePaymentAccount(2)).toThrow('bereits in Buchungen verwendet')
  expect(listPaymentAccounts().find(row => row.id === 2)?.bookingCount).toBe(2)
})
