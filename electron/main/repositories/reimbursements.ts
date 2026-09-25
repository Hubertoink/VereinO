import { getDb, withTransaction } from '../db/database'
import { writeAudit } from '../services/audit'
import type { Reimbursement, ReimbursementDetail, ReimbursementMetadata, ReimbursementRole, ReimbursementVoucher } from '../../../shared/reimbursements'

const totals = `SELECT r.id, r.title, r.partner, r.due_date AS dueDate, r.note,
  COALESCE(SUM(CASE WHEN l.role='EXPENSE' THEN l.amount_cents ELSE 0 END),0) AS expectedCents,
  COALESCE(SUM(CASE WHEN l.role='PAYMENT' THEN l.amount_cents ELSE 0 END),0) AS paidCents
  FROM reimbursements r LEFT JOIN reimbursement_links l ON l.reimbursement_id=r.id`
function status(row: Omit<Reimbursement, 'status' | 'remainingCents'>): Reimbursement {
  return { ...row, remainingCents: row.expectedCents - row.paidCents,
    status: row.expectedCents > 0 && row.paidCents >= row.expectedCents ? 'PAID' : row.paidCents > 0 ? 'PARTIAL' : 'OPEN' }
}
export function listReimbursements(input: { voucherId?: number; q?: string } = {}): Reimbursement[] {
  const where: string[] = []; const params: (number | string)[] = []
  if (input.voucherId) { where.push('EXISTS (SELECT 1 FROM reimbursement_links x WHERE x.reimbursement_id=r.id AND x.voucher_id=?)'); params.push(input.voucherId) }
  if (input.q?.trim()) { where.push('(r.title LIKE ? OR r.partner LIKE ?)'); params.push(`%${input.q.trim()}%`, `%${input.q.trim()}%`) }
  return getDb().prepare(`${totals} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY r.id ORDER BY r.id DESC`).all(...params).map(status)
}
export function getReimbursement(id: number): ReimbursementDetail {
  const db = getDb()
  const row = db.prepare(`${totals} WHERE r.id=? GROUP BY r.id`).get(id)
  if (!row) throw new Error('Kostenerstattung nicht gefunden.')
  const links = db.prepare(`SELECT v.id, v.voucher_no AS voucherNo, v.date, v.type, v.description,
    v.gross_amount AS grossAmount, pa.name AS paymentAccountName, l.id AS linkId, l.role, l.amount_cents AS amountCents,
    ROUND(v.gross_amount*100) - (SELECT SUM(amount_cents) FROM reimbursement_links WHERE voucher_id=v.id) AS availableCents
    FROM reimbursement_links l JOIN vouchers v ON v.id=l.voucher_id
    LEFT JOIN payment_accounts pa ON pa.id=v.payment_account_id
    WHERE l.reimbursement_id=? ORDER BY v.date, l.id`).all(id)
  return { ...status(row), links }
}
export function reimbursementCandidates(input: { role: ReimbursementRole; q?: string; voucherId?: number }): ReimbursementVoucher[] {
  return getDb().prepare(`SELECT v.id, v.voucher_no AS voucherNo, v.date, v.type, v.description,
    v.gross_amount AS grossAmount, pa.name AS paymentAccountName,
    ROUND(v.gross_amount*100) - COALESCE((SELECT SUM(amount_cents) FROM reimbursement_links WHERE voucher_id=v.id),0) AS availableCents
    FROM vouchers v LEFT JOIN payment_accounts pa ON pa.id=v.payment_account_id
    WHERE v.type=? AND v.original_id IS NULL AND v.reversed_by_id IS NULL
      AND (? IS NULL OR v.id=?) AND (v.voucher_no LIKE ? OR COALESCE(v.description,'') LIKE ?)
      AND ROUND(v.gross_amount*100) > COALESCE((SELECT SUM(amount_cents) FROM reimbursement_links WHERE voucher_id=v.id),0)
    ORDER BY v.date DESC, v.id DESC LIMIT 100`).all(input.role === 'EXPENSE' ? 'OUT' : 'IN', input.voucherId ?? null, input.voucherId ?? null, `%${input.q || ''}%`, `%${input.q || ''}%`)
}
function addLink(db: ReturnType<typeof getDb>, input: { id: number; voucherId: number; role: ReimbursementRole; amountCents: number }) {
  const detail = getReimbursement(input.id)
  const voucher = reimbursementCandidates({ role: input.role, voucherId: input.voucherId })[0]
  if (!voucher) throw new Error('Keine passende, noch verfügbare Buchung gefunden. Stornierte Buchungen sind ausgeschlossen.')
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > voucher.availableCents) throw new Error('Der Betrag überschreitet den noch verfügbaren Buchungsbetrag.')
  if (detail.links.some(link => link.id === input.voucherId)) throw new Error('Diese Buchung ist diesem Vorgang bereits zugeordnet.')
  if (input.role === 'PAYMENT' && input.amountCents > detail.remainingCents) throw new Error('Die Erstattung überschreitet den offenen Betrag.')
  db.prepare('INSERT INTO reimbursement_links (reimbursement_id,voucher_id,role,amount_cents) VALUES (?,?,?,?)').run(input.id, input.voucherId, input.role, input.amountCents)
  writeAudit(db, null, 'reimbursement', input.id, 'LINK', input)
}
export function createReimbursement(input: ReimbursementMetadata & { voucherId: number; amountCents: number }) {
  return withTransaction(db => {
    const id = Number(db.prepare('INSERT INTO reimbursements (title,partner,due_date,note) VALUES (?,?,?,?)').run(input.title, input.partner, input.dueDate || null, input.note || '').lastInsertRowid)
    addLink(db, { id, voucherId: input.voucherId, role: 'EXPENSE', amountCents: input.amountCents })
    writeAudit(db, null, 'reimbursement', id, 'CREATE', input)
    return getReimbursement(id)
  })
}
export function updateReimbursement(input: ReimbursementMetadata & { id: number }) {
  return withTransaction(db => {
    const before = getReimbursement(input.id)
    db.prepare('UPDATE reimbursements SET title=?,partner=?,due_date=?,note=? WHERE id=?').run(input.title, input.partner, input.dueDate || null, input.note || '', input.id)
    writeAudit(db, null, 'reimbursement', input.id, 'UPDATE', { before, after: input })
    return getReimbursement(input.id)
  })
}
export function linkReimbursement(input: { id: number; voucherId: number; role: ReimbursementRole; amountCents: number }) {
  return withTransaction(db => { addLink(db, input); return getReimbursement(input.id) })
}
export function unlinkReimbursement(input: { id: number; linkId: number }) {
  return withTransaction(db => {
    const detail = getReimbursement(input.id)
    const link = detail.links.find(row => row.linkId === input.linkId)
    if (!link) throw new Error('Zuordnung nicht gefunden.')
    if (link.role === 'EXPENSE' && detail.expectedCents - link.amountCents < detail.paidCents) throw new Error('Bitte zuerst die zugehörigen Erstattungszahlungen lösen.')
    db.prepare('DELETE FROM reimbursement_links WHERE id=? AND reimbursement_id=?').run(input.linkId, input.id)
    writeAudit(db, null, 'reimbursement', input.id, 'UNLINK', link)
    return getReimbursement(input.id)
  })
}
export function deleteReimbursement(id: number) {
  return withTransaction(db => {
    const before = getReimbursement(id)
    if (before.paidCents > 0) throw new Error('Bitte zuerst die Erstattungszahlungen lösen.')
    db.prepare('DELETE FROM reimbursements WHERE id=?').run(id)
    writeAudit(db, null, 'reimbursement', id, 'DELETE', before)
    return { ok: true }
  })
}
