import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'
import { writeAudit } from '../services/audit'
import { csvMetadataFromRaw, suggestCsvMapping, type BankCsvMetadataField } from '../services/bankStatementParser'

type DB = InstanceType<typeof Database>
type Mapping = Partial<Record<BankCsvMetadataField, string | null>>
type Values = Record<BankCsvMetadataField, string | null>
type Row = { id: number; bookingDate: string; direction: 'IN' | 'OUT'; amount: number; rawJson: string | null } & Values
const fields: BankCsvMetadataField[] = ['counterparty', 'counterpartyIban', 'purpose', 'reference', 'endToEndId']

function loadBatch(db: DB, batchId: number) {
  const batch = db.prepare(`SELECT bib.id, bib.file_name as fileName, bib.format,
    pa.name as paymentAccountName FROM bank_import_batches bib
    JOIN payment_accounts pa ON pa.id = bib.payment_account_id WHERE bib.id = ?`).get(batchId) as
    { id: number; fileName: string; format: string; paymentAccountName: string } | undefined
  if (!batch) throw new Error('Import nicht gefunden.')
  if (batch.format !== 'CSV') throw new Error('Spaltenzuordnungen lassen sich nur für CSV-Importe aktualisieren.')
  const rows = db.prepare(`SELECT id, booking_date as bookingDate, direction, amount,
    counterparty, counterparty_iban as counterpartyIban, purpose,
    bank_reference as reference, end_to_end_id as endToEndId, raw_json as rawJson
    FROM bank_transactions WHERE batch_id = ? ORDER BY id`).all(batchId) as Row[]
  if (!rows.length) throw new Error('Dieser Import enthält keine übernommenen Bankbelege.')
  const originals = rows.map(row => {
    try {
      const raw = JSON.parse(row.rawJson || '{}')
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
    } catch { return {} }
  })
  const headers = [...new Set(originals.flatMap(raw => Object.keys(raw)))]
  return { batch, rows, originals, headers }
}

function resolveMapping(headers: string[], requested?: Mapping) {
  const suggested = suggestCsvMapping(headers)
  const mapping: Mapping = requested ?? { counterparty: suggested.counterparty ?? null }
  for (const field of fields) {
    const column = mapping[field]
    if (column && !headers.includes(column)) throw new Error(`Die CSV-Spalte „${column}“ ist in diesem Import nicht vorhanden.`)
  }
  return { suggested, mapping }
}

function projected(row: Row, raw: Record<string, unknown>, mapping: Mapping) {
  const extracted = csvMetadataFromRaw(raw, mapping)
  const current = Object.fromEntries(fields.map(field => [field, row[field] ?? null])) as Values
  const proposed = { ...current }
  for (const field of fields) {
    if (mapping[field] && extracted[field]) proposed[field] = extracted[field]
  }
  const changed = fields.some(field => current[field] !== proposed[field])
  return { id: row.id, bookingDate: row.bookingDate, direction: row.direction, amount: row.amount,
    current, proposed, changed }
}

export function previewBankImportRemap(input: { batchId: number; mapping?: Mapping }) {
  const { batch, rows, originals, headers } = loadBatch(getDb(), input.batchId)
  const { suggested, mapping } = resolveMapping(headers, input.mapping)
  const projectedRows = rows.map((row, index) => projected(row, originals[index], mapping))
  return {
    ...batch, headers, suggestedMapping: Object.fromEntries(fields.map(field => [field, suggested[field] ?? null])),
    mapping, totalRows: rows.length, changeCount: projectedRows.filter(row => row.changed).length,
    rows: (projectedRows.some(row => row.changed) ? projectedRows.filter(row => row.changed) : projectedRows).slice(0, 10)
  }
}

export function applyBankImportRemap(input: { batchId: number; mapping: Mapping }) {
  return withTransaction((db: DB) => {
    const { rows, originals, headers } = loadBatch(db, input.batchId)
    const { mapping } = resolveMapping(headers, input.mapping)
    if (!fields.some(field => mapping[field])) throw new Error('Wähle mindestens eine CSV-Spalte zur Aktualisierung.')
    const update = db.prepare(`UPDATE bank_transactions SET counterparty = ?, counterparty_iban = ?,
      purpose = ?, bank_reference = ?, end_to_end_id = ?, updated_at = datetime('now') WHERE id = ?`)
    const clearSuggestion = db.prepare('DELETE FROM bank_transaction_ai_suggestions WHERE transaction_id = ?')
    let updated = 0
    rows.forEach((row, index) => {
      const next = projected(row, originals[index], mapping)
      if (!next.changed) return
      update.run(next.proposed.counterparty, next.proposed.counterpartyIban, next.proposed.purpose,
        next.proposed.reference, next.proposed.endToEndId, row.id)
      clearSuggestion.run(row.id)
      updated++
    })
    writeAudit(db, null, 'bank_import_batches', input.batchId, 'UPDATE', {
      updated, fields: fields.filter(field => mapping[field]), mapping
    })
    return { updated, totalRows: rows.length }
  })
}
