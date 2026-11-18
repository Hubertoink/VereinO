import type { AccountOpening } from '../../../shared/accountOpening'
import type Database from 'better-sqlite3'
import { getDb } from '../db/database'
import { ensurePeriodOpen } from '../services/settings'
import { writeAudit } from '../services/audit'

type DB = InstanceType<typeof Database>

export function listAccountOpenings(to = '9999-12-31', from?: string) {
  return getDb().prepare(`
    SELECT account_id AS accountId, effective_date AS date, amount_cents AS amountCents
    FROM payment_account_openings WHERE effective_date <= ? AND effective_date >= ?
    ORDER BY effective_date, account_id
  `).all(to, from ?? '') as (AccountOpening & { accountId: number })[]
}

function readOpeningVoucher(db: DB, accountId: number, voucherNo: string) {
  const voucher = db.prepare('SELECT * FROM vouchers WHERE voucher_no = ? AND payment_account_id = ?')
    .get(voucherNo.trim(), accountId) as Record<string, unknown> | undefined
  if (!voucher) throw new Error('Keine Buchung mit dieser Belegnummer auf diesem Konto gefunden.')
  if (voucher.type !== 'IN' && voucher.type !== 'OUT') throw new Error('Nur eine Einnahme oder Ausgabe kann als Anfangsbestand übernommen werden.')
  const amountCents = Math.round(Number(voucher.gross_amount) * 100) * (voucher.type === 'OUT' ? -1 : 1)
  if (!Number.isSafeInteger(amountCents) || !amountCents) throw new Error('Die Buchung hat keinen gültigen Anfangsbetrag.')
  const date = String(voucher.date)
  ensurePeriodOpen(date, db)
  if (voucher.locked_at || voucher.original_id || voucher.reversed_by_id || voucher.budget_id || voucher.earmark_id ||
      voucher.project_id || voucher.vat_rate || voucher.vat_amount) throw new Error('Diese Buchung enthält Zuordnungen, Steuern oder eine Sperre und kann nicht übernommen werden.')
  // Even cascading and SET NULL links must survive a conversion. Discover incoming
  // references from SQLite so new voucher-backed modules are protected as well.
  const references = db.prepare(`SELECT m.name AS tbl, fk."from" AS col FROM sqlite_schema m,
    pragma_foreign_key_list(m.name) fk WHERE m.type='table' AND fk."table"='vouchers'`).all() as { tbl: string; col: string }[]
  const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"'
  // Older invoice tables can have this link without a declared foreign key.
  if (db.prepare('SELECT 1 FROM invoices WHERE posted_voucher_id = ? LIMIT 1').get(voucher.id)) {
    throw new Error('Diese Buchung gehört zu einer Rechnung und kann nicht übernommen werden.')
  }
  for (const ref of references) {
    if (db.prepare(`SELECT 1 FROM ${quote(ref.tbl)} WHERE ${quote(ref.col)} = ? LIMIT 1`).get(voucher.id)) {
      throw new Error('Diese Buchung ist mit anderen Daten verknüpft und kann nicht übernommen werden.')
    }
  }
  return { voucher, amountCents, date }
}

export function previewOpeningVoucher(accountId: number, voucherNo: string) {
  const { voucher, amountCents, date } = readOpeningVoucher(getDb(), accountId, voucherNo)
  return { amountCents, date, description: String(voucher.description ?? '') }
}

// The caller commits the account, its opening and any explicit conversion together.
export function storeAccountOpening(db: DB, accountId: number, opening: AccountOpening | null, voucherNo?: string, expected?: AccountOpening | null) {
  const before = db.prepare('SELECT effective_date AS date, amount_cents AS amountCents FROM payment_account_openings WHERE account_id = ?')
    .get(accountId) as AccountOpening | undefined
  if (!voucherNo && before?.amountCents === opening?.amountCents && before?.date === opening?.date) return
  if (expected !== undefined && (before?.date !== expected?.date || before?.amountCents !== expected?.amountCents)) {
    throw new Error('Der Anfangsbestand wurde zwischenzeitlich geändert. Bitte öffne das Konto erneut.')
  }
  if (before) ensurePeriodOpen(before.date, db)
  if (opening) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opening.date) || !Number.isFinite(Date.parse(opening.date)) ||
        new Date(opening.date).toISOString().slice(0, 10) !== opening.date) throw new Error('Bitte einen gültigen Stichtag eingeben.')
    if (!Number.isSafeInteger(opening.amountCents) || opening.amountCents === 0) throw new Error('Ungültiger Anfangsbestand.')
    ensurePeriodOpen(opening.date, db)
  }
  if (voucherNo) {
    if (before) throw new Error('Für dieses Konto ist bereits ein Anfangsbestand hinterlegt.')
    const { voucher, amountCents, date } = readOpeningVoucher(db, accountId, voucherNo)
    if (!opening || opening.amountCents !== amountCents || opening.date !== date) {
      throw new Error('Bitte prüfe den aktuellen Betrag und Stichtag der Buchung erneut.')
    }
    db.prepare('DELETE FROM vouchers WHERE id = ?').run(voucher.id)
    writeAudit(db, null, 'vouchers', Number(voucher.id), 'CONVERT_TO_OPENING', { accountId, voucher })
  }
  if (opening) {
    db.prepare(`INSERT INTO payment_account_openings(account_id, effective_date, amount_cents) VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET effective_date=excluded.effective_date, amount_cents=excluded.amount_cents`)
      .run(accountId, opening.date, opening.amountCents)
  } else {
    db.prepare('DELETE FROM payment_account_openings WHERE account_id = ?').run(accountId)
  }
  writeAudit(db, null, 'payment_accounts', accountId, 'OPENING_BALANCE', { before: before ?? null, after: opening, voucherNo })
}
