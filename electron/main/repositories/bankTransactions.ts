import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'
import { getPaymentAccountById } from './paymentAccounts'
import { parseBankStatement, type BankCsvMapping, type ParsedBankTransaction } from '../services/bankStatementParser'
import { writeAudit } from '../services/audit'

type DB = InstanceType<typeof Database>
type BankStatus = 'OPEN' | 'LINKED' | 'CHECKED'
type DuplicateReason = 'REFERENCE' | 'FINGERPRINT'

function round2(value: number) {
  return Math.round(Number(value) * 100) / 100
}

function normalized(value?: string | null) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function meaningfulReference(row: ParsedBankTransaction) {
  const candidates = [row.bankReference, row.endToEndId]
  return candidates.find((value) => {
    const key = normalized(value)
    return key && key !== 'notprovided' && key !== 'nicht angegeben' && key !== 'n/a'
  })
}

function fingerprintFor(row: ParsedBankTransaction, paymentAccountId: number) {
  const reference = meaningfulReference(row)
  if (reference) return hash(`ref|${paymentAccountId}|${normalized(reference)}`)
  return hash([
    'fallback',
    paymentAccountId,
    row.bookingDate,
    row.direction,
    round2(row.amount).toFixed(2),
    normalized(row.counterparty),
    normalized(row.counterpartyIban),
    normalized(row.purpose)
  ].join('|'))
}

function duplicateReasonFor(row: ParsedBankTransaction): DuplicateReason {
  return meaningfulReference(row) ? 'REFERENCE' : 'FINGERPRINT'
}

function duplicateValueFor(row: ParsedBankTransaction) {
  return meaningfulReference(row) ?? [
    row.bookingDate,
    row.direction,
    round2(row.amount).toFixed(2),
    normalized(row.counterparty),
    normalized(row.counterpartyIban),
    normalized(row.purpose)
  ].join(' | ')
}

function existingTransactionForFingerprint(d: DB, fingerprint: string) {
  return d.prepare(`
    SELECT
      bt.id,
      bt.status,
      bt.booking_date as bookingDate,
      bt.direction,
      bt.amount,
      bt.counterparty,
      bt.purpose,
      bt.end_to_end_id as endToEndId,
      bt.bank_reference as bankReference,
      pa.name as paymentAccountName,
      bib.file_name as sourceFileName
    FROM bank_transactions bt
    JOIN payment_accounts pa ON pa.id = bt.payment_account_id
    JOIN bank_import_batches bib ON bib.id = bt.batch_id
    WHERE bt.fingerprint = ?
    ORDER BY bt.id DESC
    LIMIT 1
  `).get(fingerprint) as Record<string, any> | undefined
}

function duplicateRecordForRow(d: DB, row: ParsedBankTransaction, paymentAccountId: number) {
  const fingerprint = fingerprintFor(row, paymentAccountId)
  const existing = existingTransactionForFingerprint(d, fingerprint)
  if (!existing) return null
  return {
    sourceRow: row.sourceRow,
    bookingDate: row.bookingDate,
    valueDate: row.valueDate ?? null,
    direction: row.direction,
    amount: round2(row.amount),
    currency: row.currency,
    counterparty: row.counterparty ?? null,
    purpose: row.purpose ?? null,
    endToEndId: row.endToEndId ?? null,
    bankReference: row.bankReference ?? null,
    duplicateBy: duplicateReasonFor(row),
    duplicateValue: duplicateValueFor(row),
    existing
  }
}

function resolvePaymentAccountId(parsed: ReturnType<typeof parseBankStatement>, requested?: number | null, d: DB = getDb()) {
  if (requested) return requested
  if (parsed.format !== 'CAMT' || parsed.accountIbans.length !== 1) return null
  const iban = parsed.accountIbans[0].replace(/\s+/g, '').toUpperCase()
  const matches = d.prepare(`
    SELECT id
    FROM payment_accounts
    WHERE is_active = 1
      AND kind <> 'CASH'
      AND UPPER(REPLACE(COALESCE(iban, ''), ' ', '')) = ?
  `).all(iban) as Array<{ id: number }>
  return matches.length === 1 ? matches[0].id : null
}

function validatePaymentAccount(id: number, d: DB) {
  const account = getPaymentAccountById(id, d)
  if (!account || account.isActive === 0) throw new Error('Bitte wähle ein aktives Zahlkonto.')
  if (account.kind === 'CASH') throw new Error('Bankdaten können keinem Barkonto zugeordnet werden.')
  return account
}

export function previewBankImport(input: {
  fileBase64: string
  fileName: string
  paymentAccountId?: number | null
  mapping?: BankCsvMapping
}) {
  const parsed = parseBankStatement(input.fileBase64, input.fileName, input.mapping)
  const paymentAccountId = resolvePaymentAccountId(parsed, input.paymentAccountId)
  return {
    format: parsed.format,
    headers: parsed.headers,
    suggestedMapping: parsed.suggestedMapping,
    accountIbans: parsed.accountIbans,
    detectedPaymentAccountId: paymentAccountId,
    rows: parsed.rows.slice(0, 200).map((row) => ({
      sourceRow: row.sourceRow,
      bookingDate: row.bookingDate,
      valueDate: row.valueDate ?? null,
      direction: row.direction,
      amount: row.amount,
      currency: row.currency,
      counterparty: row.counterparty ?? null,
      counterpartyIban: row.counterpartyIban ?? null,
      purpose: row.purpose ?? null,
      endToEndId: row.endToEndId ?? null,
      bankReference: row.bankReference ?? null,
      errors: row.errors
    })),
    summary: {
      total: parsed.rows.length,
      valid: parsed.rows.filter((row) => row.errors.length === 0).length,
      errors: parsed.rows.filter((row) => row.errors.length > 0).length
    }
  }
}

export function commitBankImport(input: {
  fileBase64: string
  fileName: string
  paymentAccountId?: number | null
  mapping?: BankCsvMapping
  forceImportSourceRows?: number[]
}) {
  return withTransaction((d: DB) => {
    const parsed = parseBankStatement(input.fileBase64, input.fileName, input.mapping)
    const paymentAccountId = resolvePaymentAccountId(parsed, input.paymentAccountId, d)
    if (!paymentAccountId) throw new Error('Bitte wähle das Zahlkonto für diesen Import.')
    validatePaymentAccount(paymentAccountId, d)
    const forcedRows = new Set((input.forceImportSourceRows || []).map((row) => Number(row)).filter((row) => Number.isFinite(row) && row > 0))
    const rowsToProcess = forcedRows.size > 0
      ? parsed.rows.filter((row) => forcedRows.has(row.sourceRow))
      : parsed.rows

    const fileHash = hash(input.fileBase64)
    const batchInfo = d.prepare(`
      INSERT INTO bank_import_batches(file_name, format, file_hash, payment_account_id)
      VALUES (?, ?, ?, ?)
    `).run(input.fileName, parsed.format, fileHash, paymentAccountId)
    const batchId = Number(batchInfo.lastInsertRowid)
    const insert = d.prepare(`
      INSERT INTO bank_transactions(
        batch_id, payment_account_id, booking_date, value_date, direction, amount, currency,
        counterparty, counterparty_iban, purpose, end_to_end_id, bank_reference, raw_json, fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let imported = 0
    let duplicates = 0
    const errors: Array<{ row: number; message: string }> = []
    const duplicateRows: Array<Record<string, any>> = []
    for (const row of rowsToProcess) {
      if (row.errors.length) {
        errors.push({ row: row.sourceRow, message: row.errors.join(' ') })
        continue
      }
      const fingerprint = fingerprintFor(row, paymentAccountId)
      const existing = d.prepare('SELECT id FROM bank_transactions WHERE fingerprint = ?').get(fingerprint) as { id: number } | undefined
      if (existing && !forcedRows.has(row.sourceRow)) {
        duplicates++
        const duplicate = duplicateRecordForRow(d, row, paymentAccountId)
        if (duplicate) duplicateRows.push(duplicate)
        continue
      }
      insert.run(
        batchId,
        paymentAccountId,
        row.bookingDate,
        row.valueDate ?? null,
        row.direction,
        round2(row.amount),
        row.currency,
        row.counterparty ?? null,
        row.counterpartyIban ?? null,
        row.purpose ?? null,
        row.endToEndId ?? null,
        row.bankReference ?? null,
        JSON.stringify(row.raw),
        fingerprint
      )
      imported++
    }

    d.prepare(`
      UPDATE bank_import_batches
      SET imported_count = ?, duplicate_count = ?, error_count = ?
      WHERE id = ?
    `).run(imported, duplicates, errors.length, batchId)
    writeAudit(d, null, 'bank_imports', batchId, 'EXECUTE', {
      fileName: input.fileName,
      format: parsed.format,
      imported,
      duplicates,
      errorCount: errors.length,
      forcedImportSourceRows: Array.from(forcedRows)
    })
    return { batchId, imported, duplicates, duplicateRows, errors }
  })
}

const BANK_TRANSACTION_SELECT = `
  SELECT
    bt.id,
    bt.batch_id as batchId,
    bt.payment_account_id as paymentAccountId,
    pa.name as paymentAccountName,
    pa.color as paymentAccountColor,
    bt.booking_date as bookingDate,
    bt.value_date as valueDate,
    bt.direction,
    bt.amount,
    bt.currency,
    bt.counterparty,
    bt.counterparty_iban as counterpartyIban,
    bt.purpose,
    bt.end_to_end_id as endToEndId,
    bt.bank_reference as bankReference,
    bt.status,
    bt.voucher_id as voucherId,
    bt.link_origin as linkOrigin,
    bt.checked_note as checkedNote,
    bt.resolved_at as resolvedAt,
    bt.created_at as createdAt,
    bib.file_name as sourceFileName,
    v.voucher_no as voucherNo,
    v.description as voucherDescription,
    v.reversed_by_id as voucherReversedById
  FROM bank_transactions bt
  JOIN payment_accounts pa ON pa.id = bt.payment_account_id
  JOIN bank_import_batches bib ON bib.id = bt.batch_id
  LEFT JOIN vouchers v ON v.id = bt.voucher_id
`

export function listBankTransactions(input: {
  status?: BankStatus | 'ALL'
  paymentAccountId?: number
  from?: string
  to?: string
  q?: string
  sortBy?: 'status' | 'date' | 'description' | 'account' | 'type' | 'amount'
  sortDir?: 'ASC' | 'DESC'
  page?: number
  limit?: number
}) {
  const d = getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (input.status && input.status !== 'ALL') {
    where.push('bt.status = ?')
    params.push(input.status)
  }
  if (input.paymentAccountId) {
    where.push('bt.payment_account_id = ?')
    params.push(input.paymentAccountId)
  }
  if (input.from) {
    where.push('bt.booking_date >= ?')
    params.push(input.from)
  }
  if (input.to) {
    where.push('bt.booking_date <= ?')
    params.push(input.to)
  }
  if (input.q?.trim()) {
    const like = `%${input.q.trim()}%`
    where.push(`(
      COALESCE(bt.counterparty, '') LIKE ? OR
      COALESCE(bt.purpose, '') LIKE ? OR
      COALESCE(bt.bank_reference, '') LIKE ? OR
      COALESCE(bt.end_to_end_id, '') LIKE ?
    )`)
    params.push(like, like, like, like)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sortDir = input.sortDir === 'ASC' ? 'ASC' : 'DESC'
  const sortColumn = input.sortBy === 'status'
    ? 'bt.status'
    : input.sortBy === 'description'
      ? `COALESCE(bt.counterparty, bt.purpose, '')`
      : input.sortBy === 'account'
        ? 'pa.name'
        : input.sortBy === 'type'
          ? 'bt.direction'
          : input.sortBy === 'amount'
            ? 'bt.amount'
            : 'bt.booking_date'
  const orderSql = `ORDER BY ${sortColumn} ${sortDir}, bt.booking_date DESC, bt.id DESC`
  const page = Math.max(1, Number(input.page || 1))
  const limit = Math.min(200, Math.max(1, Number(input.limit || 50)))
  const total = Number((d.prepare(`SELECT COUNT(*) as count FROM bank_transactions bt ${whereSql}`).get(...params) as any)?.count || 0)
  const rows = d.prepare(`
    ${BANK_TRANSACTION_SELECT}
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit)
  const statsRows = d.prepare('SELECT status, COUNT(*) as count FROM bank_transactions GROUP BY status').all() as Array<{ status: BankStatus; count: number }>
  const stats = { total: 0, open: 0, linked: 0, checked: 0 }
  for (const row of statsRows) {
    stats.total += Number(row.count)
    if (row.status === 'OPEN') stats.open = Number(row.count)
    if (row.status === 'LINKED') stats.linked = Number(row.count)
    if (row.status === 'CHECKED') stats.checked = Number(row.count)
  }
  return { rows, total, page, limit, stats }
}

export function getBankTransaction(id: number) {
  const row = getDb().prepare(`${BANK_TRANSACTION_SELECT} WHERE bt.id = ?`).get(id)
  if (!row) throw new Error('Bankbeleg nicht gefunden.')
  return row
}

function compatibleVoucher(d: DB, transaction: any, voucherId: number) {
  const voucher = d.prepare(`
    SELECT id, voucher_no as voucherNo, date, type, gross_amount as grossAmount,
      payment_account_id as paymentAccountId, description, note, reversed_by_id as reversedById
    FROM vouchers
    WHERE id = ?
  `).get(voucherId) as any
  if (!voucher) throw new Error('Buchung nicht gefunden.')
  if (voucher.type !== transaction.direction) throw new Error('Buchungsart und Bankbeleg stimmen nicht überein.')
  if (round2(voucher.grossAmount) !== round2(transaction.amount)) throw new Error('Betrag und Bankbeleg stimmen nicht überein.')
  if (voucher.reversedById) throw new Error('Eine stornierte Buchung kann nicht zugeordnet werden.')
  const used = d.prepare('SELECT id FROM bank_transactions WHERE voucher_id = ? AND id <> ?').get(voucherId, transaction.id) as any
  if (used) throw new Error('Diese Buchung ist bereits einem anderen Bankbeleg zugeordnet.')
  return voucher
}

export function linkBankTransaction(input: { id: number; voucherId: number; origin?: 'EXISTING' | 'CREATED' }, d: DB = getDb()) {
  const transaction = d.prepare(`
    SELECT id, status, direction, amount, payment_account_id as paymentAccountId
    FROM bank_transactions WHERE id = ?
  `).get(input.id) as any
  if (!transaction) throw new Error('Bankbeleg nicht gefunden.')
  if (transaction.status !== 'OPEN') throw new Error('Der Bankbeleg ist bereits erledigt.')
  compatibleVoucher(d, transaction, input.voucherId)
  d.prepare(`
    UPDATE bank_transactions
    SET status = 'LINKED', voucher_id = ?, link_origin = ?, checked_note = NULL,
      resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(input.voucherId, input.origin ?? 'EXISTING', input.id)
  writeAudit(d, null, 'bank_transactions', input.id, 'LINK', { voucherId: input.voucherId, origin: input.origin ?? 'EXISTING' })
  return getBankTransaction(input.id)
}

export function markBankTransactionChecked(input: { id: number; note?: string | null }) {
  return withTransaction((d: DB) => {
    const row = d.prepare('SELECT status FROM bank_transactions WHERE id = ?').get(input.id) as any
    if (!row) throw new Error('Bankbeleg nicht gefunden.')
    if (row.status !== 'OPEN') throw new Error('Der Bankbeleg ist bereits erledigt.')
    d.prepare(`
      UPDATE bank_transactions
      SET status = 'CHECKED', voucher_id = NULL, link_origin = NULL, checked_note = ?,
        resolved_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(input.note?.trim() || null, input.id)
    writeAudit(d, null, 'bank_transactions', input.id, 'CHECK', { note: input.note?.trim() || null })
    return getBankTransaction(input.id)
  })
}

export function reopenBankTransaction(id: number) {
  return withTransaction((d: DB) => {
    const row = d.prepare('SELECT id FROM bank_transactions WHERE id = ?').get(id)
    if (!row) throw new Error('Bankbeleg nicht gefunden.')
    d.prepare(`
      UPDATE bank_transactions
      SET status = 'OPEN', voucher_id = NULL, link_origin = NULL, checked_note = NULL,
        resolved_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id)
    writeAudit(d, null, 'bank_transactions', id, 'REOPEN', {})
    return getBankTransaction(id)
  })
}

function wordSet(value?: string | null) {
  return new Set(normalized(value).split(/[^a-z0-9äöüß]+/).filter((word) => word.length >= 3))
}

export function findBankTransactionMatches(input: { id: number; q?: string; includeAllDates?: boolean; manual?: boolean }) {
  const d = getDb()
  const transaction = getBankTransaction(input.id) as any
  const manual = Boolean(input.manual)
  const where = [
    `v.reversed_by_id IS NULL`,
    `NOT EXISTS (SELECT 1 FROM bank_transactions other WHERE other.voucher_id = v.id AND other.id <> ?)`
  ]
  const params: unknown[] = [input.id]
  if (manual) {
    if (!input.includeAllDates) {
      where.push(`ABS(julianday(v.date) - julianday(?)) <= 31`)
      params.push(transaction.bookingDate)
    }
  } else {
    where.push(`v.type = ?`)
    where.push(`ROUND(v.gross_amount, 2) = ROUND(?, 2)`)
    params.push(transaction.direction, transaction.amount)
    if (!input.includeAllDates) {
      where.push(`ABS(julianday(v.date) - julianday(?)) <= 14`)
      params.push(transaction.bookingDate)
    }
  }
  if (input.q?.trim()) {
    where.push(`(v.voucher_no LIKE ? OR COALESCE(v.description, '') LIKE ? OR COALESCE(v.note, '') LIKE ?)`)
    const like = `%${input.q.trim()}%`
    params.push(like, like, like)
  }
  const rows = d.prepare(`
    SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.description, v.note,
      v.gross_amount as grossAmount, v.payment_account_id as paymentAccountId,
      pa.name as paymentAccountName, pa.color as paymentAccountColor
    FROM vouchers v
    LEFT JOIN payment_accounts pa ON pa.id = v.payment_account_id
    WHERE ${where.join(' AND ')}
    ORDER BY ABS(julianday(v.date) - julianday(?)) ASC, v.date DESC, v.id DESC
    LIMIT 100
  `).all(...params, transaction.bookingDate) as any[]

  const sourceWords = wordSet([transaction.counterparty, transaction.purpose].filter(Boolean).join(' '))
  return rows.map((row) => {
    const targetWords = wordSet([row.description, row.note].filter(Boolean).join(' '))
    let sharedWords = 0
    for (const word of sourceWords) if (targetWords.has(word)) sharedWords++
    const dateDistance = Math.abs((Date.parse(row.date) - Date.parse(transaction.bookingDate)) / 86400000)
    const paymentAccountMismatch = Number(row.paymentAccountId || 0) !== Number(transaction.paymentAccountId || 0)
    const paymentAccountWarning = paymentAccountMismatch
      ? `Zahlkonto abweichend: Buchung ${row.paymentAccountName || 'ohne Konto'} statt ${transaction.paymentAccountName || 'ohne Konto'}`
      : null
    const dateScore = Math.max(0, 35 - Math.min(35, dateDistance * 7))
    const textScore = Math.min(45, sharedWords * 15)
    const accountScore = paymentAccountMismatch ? -20 : 20
    let score = Math.max(0, Math.min(100, dateScore + textScore + accountScore))
    if (!manual) {
      if (paymentAccountMismatch && sharedWords === 0 && dateDistance > 2) score = 0
      if (!paymentAccountMismatch && sharedWords === 0 && dateDistance > 7) score = Math.min(score, 10)
    } else {
      if (paymentAccountMismatch) score = Math.max(5, score)
      if (sharedWords === 0 && dateDistance > 20) score = Math.max(1, Math.min(score, 15))
    }
    return { ...row, dateDistance, score, sharedWords, paymentAccountMismatch, paymentAccountWarning }
  }).sort((a, b) => {
    if (!manual && Number(a.paymentAccountMismatch) !== Number(b.paymentAccountMismatch)) return Number(a.paymentAccountMismatch) - Number(b.paymentAccountMismatch)
    return a.dateDistance - b.dateDistance || b.score - a.score
  })
}
