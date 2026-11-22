import type Database from 'better-sqlite3'

const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))

import { getDb } from '../../electron/main/db/database'
import { listVouchersAdvanced, listVouchersAdvancedPaged } from '../../electron/main/repositories/vouchers'

describe('advanced voucher queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new SqliteDatabase(':memory:')
    db.exec(`
      CREATE TABLE vouchers (
        id INTEGER PRIMARY KEY, voucher_no TEXT, date TEXT, year INTEGER, type TEXT, sphere TEXT,
        primary_classification_value_id INTEGER, payment_method TEXT, transfer_from TEXT, transfer_to TEXT,
        payment_account_id INTEGER, transfer_from_account_id INTEGER, transfer_to_account_id INTEGER,
        description TEXT, note TEXT, counterparty TEXT, party_id INTEGER, net_amount REAL,
        vat_rate REAL, vat_amount REAL, gross_amount REAL, amount_mode TEXT, original_id INTEGER,
        reversed_by_id INTEGER, earmark_id INTEGER, earmark_amount REAL, budget_id INTEGER, budget_amount REAL
      );
      CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, color TEXT);
      CREATE TABLE classification_values (id INTEGER PRIMARY KEY, name TEXT, color TEXT, icon TEXT);
      CREATE TABLE voucher_files (id INTEGER PRIMARY KEY, voucher_id INTEGER);
      CREATE TABLE earmarks (id INTEGER PRIMARY KEY, code TEXT, name TEXT, color TEXT);
      CREATE TABLE budgets (id INTEGER PRIMARY KEY, year INTEGER, sphere TEXT, name TEXT, category_name TEXT,
        project_name TEXT, category_id INTEGER, project_id INTEGER, earmark_id INTEGER, color TEXT);
      CREATE TABLE voucher_budgets (id INTEGER PRIMARY KEY, voucher_id INTEGER, budget_id INTEGER, amount REAL);
      CREATE TABLE voucher_earmarks (id INTEGER PRIMARY KEY, voucher_id INTEGER, earmark_id INTEGER, amount REAL);
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
      CREATE TABLE voucher_tags (voucher_id INTEGER, tag_id INTEGER, PRIMARY KEY (voucher_id, tag_id));
      CREATE TABLE cash_checks (voucher_id INTEGER);
      CREATE TABLE member_advances (placeholder_voucher_id INTEGER, resolved_at TEXT);
      INSERT INTO payment_accounts VALUES (1, 'Alpha Bank', 'BANK', '#112233'), (2, 'Kasse', 'CASH', '#445566');
      INSERT INTO classification_values VALUES (10, 'Jugend', '#abcdef', 'users'), (20, 'Sport', '#fedcba', 'ball');
      INSERT INTO earmarks(id, code) VALUES (7, 'ZWECK-7');
      INSERT INTO budgets (id, year, sphere, name, color) VALUES (8, 2026, 'IDEELL', 'Material', '#123456');
      INSERT INTO vouchers (id, voucher_no, date, year, type, sphere, primary_classification_value_id,
        payment_method, payment_account_id, description, gross_amount, net_amount, budget_id, earmark_id) VALUES
        (1, '2026-001', '2026-01-01', 2026, 'IN', 'IDEELL', 10, 'BANK', 1, 'Beitrag', 100, 100, 8, 7),
        (2, '2026-002', '2026-01-02', 2026, 'OUT', 'IDEELL', 20, 'BAR', 2, 'Material', 200, 180, NULL, NULL),
        (3, '2026-003', '2026-01-03', 2026, 'TRANSFER', 'IDEELL', 10, NULL, NULL, 'Umbuchung', 300, 300, NULL, NULL),
        (4, '2026-004', '2026-01-04', 2026, 'OUT', 'WGB', 20, 'BANK', 999, 'Ohne Stammdaten', 400, 350, NULL, NULL);
      UPDATE vouchers SET transfer_from = 'BANK', transfer_to = 'BAR', transfer_from_account_id = 1,
        transfer_to_account_id = 2 WHERE id = 3;
      UPDATE vouchers SET original_id = 1, reversed_by_id = 4, note = 'Notiz', counterparty = 'Testverein',
        party_id = 5, amount_mode = 'GROSS', vat_rate = 0, vat_amount = 0, budget_amount = 100,
        earmark_amount = 100 WHERE id = 1;
      INSERT INTO voucher_budgets (voucher_id, budget_id, amount) VALUES (2, 8, 200);
      INSERT INTO tags VALUES (1, 'Event'), (2, 'Spende');
      INSERT INTO voucher_tags VALUES (1, 1), (1, 2), (2, 1);
      INSERT INTO voucher_files VALUES (1, 1), (2, 1), (3, 2);
      INSERT INTO cash_checks VALUES (1);
      INSERT INTO member_advances VALUES (2, NULL), (4, '2026-01-05');
    `)
    jest.mocked(getDb).mockReturnValue(db)
  })

  afterEach(() => db.close())

  test.each([
    [{ paymentAccountId: 1 }, [3, 1]],
    [{ paymentAccountId: 2 }, [3, 2]],
    [{ primaryClassificationValueId: 10 }, [3, 1]],
    [{ paymentAccountId: 2, primaryClassificationValueId: 10 }, [3]],
    [{ paymentAccountId: 999 }, [4]],
    [{ paymentMethod: 'BAR' as const }, [3, 2]],
    [{ sphere: 'IDEELL' as const, type: 'OUT' as const }, [2]],
    [{ from: '2026-01-02', to: '2026-01-03' }, [3, 2]],
    [{ budgetId: 8 }, [2, 1]],
    [{ earmarkId: 7 }, [1]],
    [{ q: '2.1.2026' }, [2]],
    [{ q: '#3' }, [3]],
    [{ tag: 'Spende' }, [1]]
  ])('applies the same filters to list and paged results: %j', (filters, expectedIds) => {
    expect(listVouchersAdvanced(filters).map(row => row.id)).toEqual(expectedIds)
    const page = listVouchersAdvancedPaged(filters)
    expect(page.rows.map(row => row.id)).toEqual(expectedIds)
    expect(page.total).toBe(expectedIds.length)
  })

  it('counts matching vouchers before pagination, even with multiple attachments and tags', () => {
    const page = listVouchersAdvancedPaged({ hasFiles: true, tag: 'Event', limit: 1, offset: 1 })
    expect(page.total).toBe(2)
    expect(page.rows.map(row => row.id)).toEqual([1])
    expect(page.rows[0].fileCount).toBe(2)
    expect(page.rows[0].tags).toEqual(['Event', 'Spende'])
    expect(listVouchersAdvancedPaged({ hasFiles: false }).rows.map(row => row.id)).toEqual([4, 3])
    expect(listVouchersAdvancedPaged({ voucherIds: [1, 3], paymentAccountId: 2 }).rows.map(row => row.id)).toEqual([3])
  })

  it('preserves projected metadata and paged-only state flags', () => {
    const [row] = listVouchersAdvanced({ earmarkId: 7 })
    expect(row).toMatchObject({
      id: 1, voucherNo: '2026-001', primaryClassificationName: 'Jugend', primaryClassificationColor: '#abcdef',
      primaryClassificationIcon: 'users', paymentAccountName: 'Alpha Bank', paymentAccountKind: 'BANK',
      paymentAccountColor: '#112233', note: 'Notiz', counterparty: 'Testverein', partyId: 5,
      amountMode: 'GROSS', originalVoucherNo: '2026-001', reversedByVoucherNo: '2026-004',
      budgetLabel: 'Material', budgetColor: '#123456', earmarkCode: 'ZWECK-7', tags: ['Event', 'Spende']
    })
    expect(row).not.toHaveProperty('isCashCheck')
    const rows = listVouchersAdvancedPaged({ sort: 'ASC' }).rows
    expect(rows[0]).toMatchObject({ ...row, isCashCheck: true, isAdvancePlaceholder: false })
    expect(rows[1]).toMatchObject({ isCashCheck: false, isAdvancePlaceholder: true })
    expect(rows[2]).toMatchObject({ transferFromAccountName: 'Alpha Bank', transferFromAccountKind: 'BANK',
      transferFromAccountColor: '#112233', transferToAccountName: 'Kasse', transferToAccountKind: 'CASH',
      transferToAccountColor: '#445566', paymentAccountName: null })
    expect(rows[3]).toMatchObject({ paymentAccountName: null, isAdvancePlaceholder: false })
  })

  test.each([
    ['date', [2, 3]], ['type', [2, 4]], ['description', [2, 4]], ['gross', [2, 3]], ['net', [2, 3]],
    ['attachments', [4, 2]], ['budget', [3, 4]], ['earmark', [3, 4]], ['payment', [1, 4]], ['sphere', [2, 3]]
  ] as const)(
    'keeps sorting and pagination equivalent for %s', (sortBy, expected) => {
      const filters = { sortBy, sort: 'ASC' as const, limit: 2, offset: 1 }
      expect(listVouchersAdvanced(filters).map(row => row.id)).toEqual(expected)
      expect(listVouchersAdvancedPaged(filters).rows.map(row => row.id)).toEqual(expected)
    }
  )
})
