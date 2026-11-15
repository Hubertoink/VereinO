import type { AiImportRelation, AiImportRow } from '../../../shared/aiImport'

const textKey = (s: unknown) => String(s || '').toLocaleLowerCase('de').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function detectImportRelations(rows: AiImportRow[], existing: Array<{ id: number; values: Record<string, any> }> = []): AiImportRelation[] {
  const result: AiImportRelation[] = []
  const amounts = new Map<number, AiImportRow[]>()
  for (const voucher of existing) {
    const amount = Math.round(Math.abs(Number(voucher.values.grossAmount)) * 100)
    const previous = amounts.get(amount) || []
    previous.push({ draft: { id: `db:${voucher.id}`, sourceRow: 0, status: 'ok', issues: [], original: {}, values: voucher.values }, sourceValues: {}, origins: {}, reasons: {}, selected: false, relationsChecked: false })
    amounts.set(amount, previous)
  }
  for (const row of rows) {
    if (row.draft.status === 'ignored') continue
    const v = row.draft.values
    const amount = Math.round(Math.abs(Number(v.grossAmount)) * 100)
    if (!amount || !Number.isFinite(amount)) continue
    const previous = amounts.get(amount) || []
    for (const other of previous) {
      const ov = other.draft.values
      const days = Math.abs(Date.parse(String(v.date)) - Date.parse(String(ov.date))) / 86400000
      if (!Number.isFinite(days) || days > 30) continue
      const sameText = textKey(v.description) === textKey(ov.description) && !!textKey(v.description)
      const common = textKey(v.description).split(' ').filter(w => w.length > 3 && textKey(ov.description).split(' ').includes(w)).length
      const sameAccount = textKey(v.paymentAccount) === textKey(ov.paymentAccount)
      let kind: AiImportRelation['kind'] | undefined
      if (v.type === ov.type && days === 0 && sameText && sameAccount) kind = 'duplicate'
      else if (v.type !== ov.type && (sameText || common > 0)) {
        const description = `${v.description} ${ov.description}`
        kind = /storno|stornierung/i.test(description) ? 'reversal' : /umbuchung|übertrag|transfer|kassenentnahme|bareinzahlung/i.test(description) && !sameAccount && days <= 3 ? 'transfer' : /erstattung|rückzahlung|retoure/i.test(description) ? 'refund' : 'unclear'
      }
      if (kind) result.push({ id: other.draft.id.startsWith('db:') ? `${row.draft.id}|voucher:${other.draft.id.slice(3)}` : `${other.draft.id}|${row.draft.id}`, rowIds: other.draft.id.startsWith('db:') ? [row.draft.id] : [other.draft.id, row.draft.id], ...(other.draft.id.startsWith('db:') ? { voucherId: Number(other.draft.id.slice(3)) } : {}), kind,
        reason: kind === 'duplicate' ? 'Gleiches Datum, gleicher Betrag, Text und Konto. Mögliche doppelte Zeile.' : 'Gleicher Betrag mit entgegengesetzter Richtung und ähnlichem Text. Beziehung bitte prüfen.' })
    }
    previous.push(row); amounts.set(amount, previous)
    for (const voucherId of row.draft.duplicateIds || []) if (!result.some(r => r.id === `${row.draft.id}|voucher:${voucherId}`)) result.push({ id: `${row.draft.id}|voucher:${voucherId}`, rowIds: [row.draft.id], voucherId, kind: 'duplicate', reason: `Ähnliche Buchung #${voucherId} ist bereits vorhanden.` })
    if (result.length > 1000) throw new Error('Mehr als 1.000 mögliche Beziehungen erkannt. Bitte die Datei in kleinere Abschnitte aufteilen, damit die Beziehungen einzeln prüfbar bleiben.')
  }
  return result
}
