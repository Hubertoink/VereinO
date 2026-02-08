import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

export type CashCheckRow = {
  id: number
  year: number
  date: string
  soll: number
  ist: number
  diff: number
  voucherId: number | null
  voucherNo: string | null
  budgetId: number | null
  budgetLabel: string | null
  note: string | null
  inspector1Name: string | null
  inspector2Name: string | null
  createdAt: string
}

function ensureCashChecksTable(d: DB) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS cash_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      date TEXT NOT NULL,
      soll REAL NOT NULL,
      ist REAL NOT NULL,
      diff REAL NOT NULL,
      voucher_id INTEGER,
      budget_id INTEGER,
      note TEXT,
      inspector1_member_id INTEGER,
      inspector1_name TEXT,
      inspector2_member_id INTEGER,
      inspector2_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
      FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE SET NULL,
      FOREIGN KEY(inspector1_member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(inspector2_member_id) REFERENCES members(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cash_checks_year_date ON cash_checks(year, date);
    CREATE INDEX IF NOT EXISTS idx_cash_checks_voucher ON cash_checks(voucher_id);
  `)
}

function budgetLabelSql(alias = 'b') {
  return `CASE
    WHEN ${alias}.name IS NOT NULL AND ${alias}.name <> '' THEN ${alias}.name
    WHEN ${alias}.category_name IS NOT NULL AND ${alias}.category_name <> '' THEN printf('%04d-%s-%s', ${alias}.year, ${alias}.sphere, ${alias}.category_name)
    WHEN ${alias}.project_name IS NOT NULL AND ${alias}.project_name <> '' THEN printf('%04d-%s-%s', ${alias}.year, ${alias}.sphere, ${alias}.project_name)
    ELSE printf('%04d-%s', ${alias}.year, ${alias}.sphere)
  END`
}

export function listCashChecks(params: { year: number }): { rows: CashCheckRow[] } {
  const d = getDb()
  ensureCashChecksTable(d)
  const year = Number(params.year)
  const rows = d
    .prepare(
      `
      SELECT
        cc.id,
        cc.year,
        cc.date,
        cc.soll,
        cc.ist,
        cc.diff,
        cc.voucher_id as voucherId,
        v.voucher_no as voucherNo,
        cc.budget_id as budgetId,
        ${budgetLabelSql('b')} as budgetLabel,
        cc.note,
        cc.inspector1_name as inspector1Name,
        cc.inspector2_name as inspector2Name,
        cc.created_at as createdAt
      FROM cash_checks cc
      LEFT JOIN vouchers v ON v.id = cc.voucher_id
      LEFT JOIN budgets b ON b.id = cc.budget_id
      WHERE cc.year = ?
      ORDER BY cc.date DESC, cc.id DESC
      `
    )
    .all(year) as any[]

  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      year: Number(r.year),
      date: String(r.date),
      soll: Number(r.soll) || 0,
      ist: Number(r.ist) || 0,
      diff: Number(r.diff) || 0,
      voucherId: r.voucherId != null ? Number(r.voucherId) : null,
      voucherNo: r.voucherNo != null ? String(r.voucherNo) : null,
      budgetId: r.budgetId != null ? Number(r.budgetId) : null,
      budgetLabel: r.budgetLabel != null ? String(r.budgetLabel) : null,
      note: r.note != null ? String(r.note) : null,
      inspector1Name: r.inspector1Name != null ? String(r.inspector1Name) : null,
      inspector2Name: r.inspector2Name != null ? String(r.inspector2Name) : null,
      createdAt: String(r.createdAt)
    }))
  }
}

export function createCashCheck(input: {
  year: number
  date: string
  soll: number
  ist: number
  diff: number
  voucherId?: number | null
  budgetId?: number | null
  note?: string | null
}): { id: number } {
  return withTransaction((d: DB) => {
    ensureCashChecksTable(d)
    const info = d
      .prepare(
        `
        INSERT INTO cash_checks(
          year, date, soll, ist, diff, voucher_id, budget_id, note
        ) VALUES (?,?,?,?,?,?,?,?)
        `
      )
      .run(
        Number(input.year),
        input.date,
        Number(input.soll) || 0,
        Number(input.ist) || 0,
        Number(input.diff) || 0,
        input.voucherId ?? null,
        input.budgetId ?? null,
        input.note ?? null
      )
    return { id: Number(info.lastInsertRowid) }
  })
}

export function setCashCheckInspectors(input: {
  id: number
  inspector1Name?: string | null
  inspector2Name?: string | null
}): { id: number } {
  return withTransaction((d: DB) => {
    ensureCashChecksTable(d)
    const cur = d.prepare('SELECT id FROM cash_checks WHERE id = ?').get(input.id) as any
    if (!cur) throw new Error('Kassenprüfung nicht gefunden')

    d.prepare(
      `
      UPDATE cash_checks
      SET inspector1_name = ?, inspector2_name = ?
      WHERE id = ?
      `
    ).run(
      input.inspector1Name != null && String(input.inspector1Name).trim() ? String(input.inspector1Name).trim() : null,
      input.inspector2Name != null && String(input.inspector2Name).trim() ? String(input.inspector2Name).trim() : null,
      input.id
    )

    return { id: input.id }
  })
}

export function getCashCheckById(id: number): (CashCheckRow & { budgetSphere?: string | null }) | null {
  const d = getDb()
  ensureCashChecksTable(d)
  const row = d
    .prepare(
      `
      SELECT
        cc.id,
        cc.year,
        cc.date,
        cc.soll,
        cc.ist,
        cc.diff,
        cc.voucher_id as voucherId,
        v.voucher_no as voucherNo,
        cc.budget_id as budgetId,
        ${budgetLabelSql('b')} as budgetLabel,
        b.sphere as budgetSphere,
        cc.note,
        cc.inspector1_name as inspector1Name,
        cc.inspector2_name as inspector2Name,
        cc.created_at as createdAt
      FROM cash_checks cc
      LEFT JOIN vouchers v ON v.id = cc.voucher_id
      LEFT JOIN budgets b ON b.id = cc.budget_id
      WHERE cc.id = ?
      LIMIT 1
      `
    )
    .get(id) as any
  if (!row) return null
  return {
    id: Number(row.id),
    year: Number(row.year),
    date: String(row.date),
    soll: Number(row.soll) || 0,
    ist: Number(row.ist) || 0,
    diff: Number(row.diff) || 0,
    voucherId: row.voucherId != null ? Number(row.voucherId) : null,
    voucherNo: row.voucherNo != null ? String(row.voucherNo) : null,
    budgetId: row.budgetId != null ? Number(row.budgetId) : null,
    budgetLabel: row.budgetLabel != null ? String(row.budgetLabel) : null,
    budgetSphere: row.budgetSphere != null ? String(row.budgetSphere) : null,
    note: row.note != null ? String(row.note) : null,
    inspector1Name: row.inspector1Name != null ? String(row.inspector1Name) : null,
    inspector2Name: row.inspector2Name != null ? String(row.inspector2Name) : null,
    createdAt: String(row.createdAt)
  }
}

export function getCashCheckInspectorDefaults(): { inspector1Name: string | null; inspector2Name: string | null } {
  const d = getDb()
  try {
    const rows = d
      .prepare(
        "SELECT name, board_role as boardRole, status FROM members WHERE board_role IN ('KASSENPR1','KASSENPR2') AND status <> 'LEFT'"
      )
      .all() as any[]
    const pr1 = rows.find((r) => r.boardRole === 'KASSENPR1')?.name
    const pr2 = rows.find((r) => r.boardRole === 'KASSENPR2')?.name
    return {
      inspector1Name: pr1 ? String(pr1) : null,
      inspector2Name: pr2 ? String(pr2) : null
    }
  } catch {
    return { inspector1Name: null, inspector2Name: null }
  }
}
