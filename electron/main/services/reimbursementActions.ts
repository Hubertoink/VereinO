import { withTransaction } from '../db/database'
import { createReimbursement, updateReimbursement, linkReimbursement, unlinkReimbursement, deleteReimbursement, getReimbursement, reimbursementCandidates } from '../repositories/reimbursements'
import { reimbursementCommandSchema, type ReimbursementActionPreview } from '../../../shared/reimbursementActions'

export function previewReimbursementAction(raw: unknown): ReimbursementActionPreview {
  const command = reimbursementCommandSchema.parse(raw)
  const before = command.action === 'CREATE' ? null : getReimbursement(command.id)
  const role = command.action === 'CREATE' ? 'EXPENSE' : command.action === 'LINK' ? command.role : null
  const voucher = 'voucherId' in command && role ? reimbursementCandidates({ role, voucherId: command.voucherId })[0] : null
  if ('amountCents' in command) {
    if (!voucher || command.amountCents > voucher.availableCents) throw new Error('Buchung oder verfügbarer Betrag passt nicht zur Zuordnung.')
    if (before?.links.some(link => link.id === command.voucherId)) throw new Error('Buchung bereits zugeordnet.')
    if (role === 'PAYMENT' && before && command.amountCents > before.remainingCents) throw new Error('Erstattung überschreitet den offenen Betrag.')
  }
  if (command.action === 'UNLINK') {
    const link = before!.links.find(link => link.linkId === command.linkId)
    if (!link) throw new Error('Zuordnung nicht gefunden.')
    if (link.role === 'EXPENSE' && before!.expectedCents - link.amountCents < before!.paidCents) throw new Error('Zuerst die Erstattungszahlungen lösen.')
  }
  if (command.action === 'DELETE' && before!.paidCents) throw new Error('Zuerst die Erstattungszahlungen lösen.')
  return { command, before, voucher: voucher || null, expectedState: JSON.stringify({ before, voucher: voucher || null }) }
}

/** Called only by the renderer's explicit review action; never exposed as an agent tool. */
export function applyReimbursementAction(input: { command: unknown; expectedState: string }) {
  return applyReimbursementActions([input])[0]
}

export function applyReimbursementActions(inputs: Array<{ command: unknown; expectedState: string }>) {
  return withTransaction(() => {
    const previews = inputs.map(input => {
      const preview = previewReimbursementAction(input.command)
      if (preview.expectedState !== input.expectedState) throw new Error('Die Daten haben sich seit der Vorschau geändert. Bitte einen neuen Vorschlag erstellen lassen.')
      return preview
    })
    return previews.map(({ command }) => {
      switch (command.action) {
        case 'CREATE': return createReimbursement(command)
        case 'UPDATE': return updateReimbursement(command)
        case 'LINK': return linkReimbursement(command)
        case 'UNLINK': return unlinkReimbursement(command)
        case 'DELETE': deleteReimbursement(command.id); return null
      }
    })
  })
}
