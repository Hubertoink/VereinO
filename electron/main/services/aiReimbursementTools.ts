import { z } from 'zod'
import type { AiAgentTool } from './aiAgentTools'
import { listReimbursements, getReimbursement, reimbursementCandidates } from '../repositories/reimbursements'
import { previewReimbursementAction } from './reimbursementActions'

const parameters = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', additionalProperties: false, properties, required })
const string = { type: ['string', 'null'] }
const id = { type: ['integer', 'null'], minimum: 1 }
export function createReimbursementTools(): AiAgentTool[] {
  return [
    {
      name: 'reimbursements_search', readOnly: true,
      description: 'Liest Kostenerstattungen mit Partner, Fälligkeit, Status und erwartetem/erstattetem/offenem Betrag in Cent. Optional nach Text, Buchung oder Status filtern. Keine Rechnungen; Zuordnungen bereits gebuchter Ausgaben und Rückzahlungen. UI-Einstieg: Verbindlichkeiten > Kostenerstattungen; bei gespeicherten Ausgaben auch Weitere Aktionen > Erstattung erwarten.',
      parameters: parameters({ q: string, voucherId: id, status: { type: ['string', 'null'], enum: ['OPEN', 'PARTIAL', 'PAID', null] } }),
      run(raw) {
        const args = z.object({ q: z.string().max(200).nullish(), voucherId: z.number().int().positive().nullish(), status: z.enum(['OPEN', 'PARTIAL', 'PAID']).nullish() }).parse(raw || {})
        const rows = listReimbursements({ q: args.q ?? undefined, voucherId: args.voucherId ?? undefined }).filter(row => !args.status || row.status === args.status)
        return { ok: true, data: { rows, count: rows.length, expectedCents: rows.reduce((n,r) => n+r.expectedCents,0), paidCents: rows.reduce((n,r) => n+r.paidCents,0), remainingCents: rows.reduce((n,r) => n+r.remainingCents,0) } }
      }
    },
    {
      name: 'reimbursement_get', readOnly: true,
      description: 'Liest einen Erstattungsvorgang samt Notiz, Partner, Fälligkeit und allen Ausgaben-/Zahlungsverknüpfungen mit linkId, Buchungsnummer, Datum, Zahlkonto und Teilbeträgen in Cent.',
      parameters: parameters({ id }, ['id']),
      run(raw) { return { ok: true, data: getReimbursement(z.object({ id: z.number().int().positive() }).parse(raw).id) } }
    },
    {
      name: 'reimbursement_candidates', readOnly: true,
      description: 'Sucht verfügbare bereits gebuchte Ausgaben (EXPENSE) oder Einnahmen (PAYMENT) für Kostenerstattungen, auch nach voucherId. availableCents berücksichtigt alle bisherigen Zuordnungen; stornierte Buchungen ausgeschlossen. Maximal 100 neueste Treffer, Suche bei Bedarf eingrenzen. Bankeingänge müssen zuerst regulär gebucht/mit einer vorhandenen Einnahme verknüpft sein.',
      parameters: parameters({ role: { type: 'string', enum: ['EXPENSE', 'PAYMENT'] }, q: string, voucherId: id }, ['role']),
      run(raw) {
        const args = z.object({ role: z.enum(['EXPENSE', 'PAYMENT']), q: z.string().max(200).nullish(), voucherId: z.number().int().positive().nullish() }).parse(raw)
        return { ok: true, data: reimbursementCandidates({ ...args, q: args.q ?? undefined, voucherId: args.voucherId ?? undefined }) }
      }
    },
    {
      name: 'reimbursement_action_draft_prepare', readOnly: false,
      description: 'Bereitet eine geprüfte Kostenerstattungsänderung zur Nutzerfreigabe vor, speichert nichts. CREATE: title, partner, dueDate (ISO/null), note, voucherId einer Ausgabe, amountCents. UPDATE: id und vollständige Metadaten title/partner/dueDate/note (zuvor lesen, unveränderte Werte erhalten). LINK: id, voucherId, role EXPENSE/PAYMENT, amountCents. UNLINK: id, linkId. DELETE: id. Beträge immer positive ganze Cent; mehrere Ausgaben, Teil- und Sammelerstattungen möglich. Erst nach Freigabe existieren neu angelegte Vorgänge. Zuordnungen erzeugen keine Finanzbuchungen.',
      parameters: parameters({ action: { type: 'string', enum: ['CREATE', 'UPDATE', 'LINK', 'UNLINK', 'DELETE'] }, id, title: string, partner: string, dueDate: string, note: string, voucherId: id, amountCents: id, role: { type: ['string', 'null'], enum: ['EXPENSE', 'PAYMENT', null] }, linkId: id }, ['action']),
      run(raw) {
        const args = z.record(z.unknown()).parse(raw)
        const preview = previewReimbursementAction({ ...args, ...(args.action === 'CREATE' ? { dueDate: args.dueDate ?? null, note: args.note ?? '' } : {}) })
        return { ok: true, draft: { kind: 'reimbursementAction', title: `Kostenerstattung: ${'title' in preview.command ? preview.command.title : preview.before!.title}`, payload: { changes: [preview] } }, data: preview }
      }
    }
  ]
}
