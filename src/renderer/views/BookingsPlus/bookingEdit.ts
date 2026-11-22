import type { TVoucherUpdateInput } from '../../../../electron/main/ipc/schemas'
import type { QA } from '../../hooks/useQuickAdd'
import type { EditVoucherRow } from '../Journal/types'
import { getInternalAssignmentValidationState } from '../../components/modals/voucherMetaValidation'
import { encodeFileForUpload } from '../../utils/fileEncoding'
import { normalizeVoucherBudgetAssignments, normalizeVoucherEarmarkAssignments } from '../../utils/voucherAssignmentFallbacks'

type ReversalFields = Pick<EditVoucherRow, 'originalId' | 'originalVoucherNo' | 'reversedById' | 'reversedByVoucherNo'>
export type BookingEditForm = QA & ReversalFields & { id: number }

export function friendlyVoucherError(e: unknown) {
  const msg = String(e instanceof Error ? e.message : e || '')
  if (/Zweckbindung.*liegt vor Beginn/i.test(msg))
    return 'Warnung: Das Buchungsdatum liegt vor dem Startdatum der ausgewählten Zweckbindung.'
  if (/Zweckbindung.*liegt nach Ende/i.test(msg))
    return 'Warnung: Das Buchungsdatum liegt nach dem Enddatum der ausgewählten Zweckbindung.'
  if (/Zweckbindung ist inaktiv/i.test(msg))
    return 'Warnung: Die ausgewählte Zweckbindung ist inaktiv und kann nicht verwendet werden.'
  if (/Zweckbindung würde den verfügbaren Rahmen unterschreiten/i.test(msg))
    return 'Warnung: Diese Änderung würde den verfügbaren Rahmen der Zweckbindung unterschreiten.'
  if (/UNIQUE constraint failed.*voucher_budgets/i.test(msg))
    return 'Fehler: Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne doppelte Budget-Einträge.'
  if (/UNIQUE constraint failed.*voucher_earmarks/i.test(msg))
    return 'Fehler: Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne doppelte Einträge.'
  if (/UNIQUE constraint failed/i.test(msg))
    return 'Fehler: Doppelter Eintrag - diese Kombination existiert bereits.'
  return 'Fehler: ' + msg
}

export function voucherRowToBookingForm(row: Partial<EditVoucherRow>): BookingEditForm {
  return {
    ...row,
    id: Number(row?.id),
    date: row?.date || new Date().toISOString().slice(0, 10),
    type: row?.type || 'IN',
    sphere: row?.sphere || 'IDEELL',
    description: row?.description ?? '',
    paymentMethod: row?.paymentMethod ?? undefined,
    paymentAccountId: row?.paymentAccountId ?? null,
    paymentAccountName: row?.paymentAccountName ?? null,
    transferFrom: row?.transferFrom ?? undefined,
    transferTo: row?.transferTo ?? undefined,
    transferFromAccountId: row?.transferFromAccountId ?? null,
    transferFromAccountName: row?.transferFromAccountName ?? null,
    transferToAccountId: row?.transferToAccountId ?? null,
    transferToAccountName: row?.transferToAccountName ?? null,
    mode:
      row?.amountMode ??
      row?.mode ??
      (Number(row?.netAmount ?? 0) > 0 ? 'NET' : 'GROSS'),
    netAmount: row?.netAmount ?? undefined,
    grossAmount: row?.grossAmount ?? undefined,
    vatRate: row?.vatRate ?? 0,
    tags: Array.isArray(row?.tags) ? row.tags : [],
    budgets: normalizeVoucherBudgetAssignments(row),
    earmarksAssigned: normalizeVoucherEarmarkAssignments(row)
  }
}

function bookingFormGrossAmount(row: BookingEditForm) {
  if (row.type === 'TRANSFER' || row.type === 'INTERNAL') return Number(row?.grossAmount || 0)
  if ((row?.mode ?? 'GROSS') === 'GROSS') return Number(row?.grossAmount || 0)
  const net = Number(row?.netAmount || 0)
  const vatRate = Number(row?.vatRate || 0)
  const vat = Math.round(net * vatRate) / 100
  return Math.round((net + vat) * 100) / 100
}

export function bookingEditTitle(row: BookingEditForm) {
  const desc = String(row?.description || '').trim()
  return desc
    ? `Buchung (${desc.length > 60 ? desc.slice(0, 60) + '...' : desc}) bearbeiten`
    : 'Buchung bearbeiten'
}

export function voucherMutationBlockReason(row: ReversalFields | null) {
  if (!row) return ''
  if (row.originalId) {
    const ref = row.originalVoucherNo ? ` #${row.originalVoucherNo}` : ''
    return `Diese Stornobuchung ist mit der Originalbuchung${ref} verknüpft und kann nicht bearbeitet oder erneut storniert werden.`
  }
  if (row.reversedById) {
    const ref = row.reversedByVoucherNo ? ` #${row.reversedByVoucherNo}` : ''
    return `Diese Buchung wurde bereits storniert${ref ? ` durch${ref}` : ''} und kann nicht mehr bearbeitet werden.`
  }
  return ''
}

export function serializeBookingForm(row: BookingEditForm | null) {
  if (!row) return ''
  return JSON.stringify({
    date: row.date || '',
    type: row.type || null,
    sphere: row.sphere || null,
    description: (row.description || '').trim(),
    note: (row.note || '').trim(),
    counterparty: (row.counterparty || '').trim(),
    partyId: row.partyId ?? null,
    primaryClassificationValueId: row.primaryClassificationValueId ?? null,
    paymentMethod: row.paymentMethod || null,
    paymentAccountId: row.paymentAccountId || null,
    transferFrom: row.transferFrom || null,
    transferTo: row.transferTo || null,
    transferFromAccountId: row.transferFromAccountId || null,
    transferToAccountId: row.transferToAccountId || null,
    mode: row.mode || 'GROSS',
    grossAmount: Number(row.grossAmount ?? 0),
    netAmount: Number(row.netAmount ?? 0),
    vatRate: Number(row.vatRate ?? 0),
    tags: Array.isArray(row.tags) ? [...row.tags].sort() : [],
    budgets: Array.isArray(row.budgets)
      ? [...row.budgets]
          .map((b) => ({ budgetId: Number(b.budgetId || 0), amount: Number(b.amount || 0) }))
          .sort((a, b) => a.budgetId - b.budgetId || a.amount - b.amount)
      : [],
    earmarksAssigned: Array.isArray(row.earmarksAssigned)
      ? [...row.earmarksAssigned]
          .map((e) => ({ earmarkId: Number(e.earmarkId || 0), amount: Number(e.amount || 0) }))
          .sort((a, b) => a.earmarkId - b.earmarkId || a.amount - b.amount)
      : []
  })
}

export function buildVoucherUpdatePayloadFromForm(row: BookingEditForm): { payload: TVoucherUpdateInput; error?: undefined } | { error: string; payload?: undefined } {
  if (!row?.id) return { error: 'Buchung konnte nicht gespeichert werden: ID fehlt.' }
  if (!row.date) return { error: 'Bitte wähle ein Buchungsdatum aus.' }
  const blockReason = voucherMutationBlockReason(row)
  if (blockReason) return { error: blockReason }
  if (row.type === 'TRANSFER' && (!row.transferFromAccountId || !row.transferToAccountId)) {
    return { error: 'Bitte wähle Quell- und Zielkonto für den Transfer aus.' }
  }
  if (row.type !== 'TRANSFER' && row.type !== 'INTERNAL' && !row.paymentAccountId) {
    return { error: 'Bitte wähle ein Buchungskonto aus.' }
  }

  const budgets = Array.isArray(row.budgets)
    ? row.budgets
        .filter((b) => b.budgetId && (row.type === 'INTERNAL' ? Number(b.amount) !== 0 : Number(b.amount) > 0))
        .map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
    : []
  const earmarks = Array.isArray(row.earmarksAssigned)
    ? row.earmarksAssigned
        .filter((e) => e.earmarkId && (row.type === 'INTERNAL' ? Number(e.amount) !== 0 : Number(e.amount) > 0))
        .map((e) => ({ earmarkId: Number(e.earmarkId), amount: Number(e.amount) }))
    : []

  const budgetIds = budgets.map((b) => b.budgetId)
  if (new Set(budgetIds).size !== budgetIds.length) {
    return {
      error:
        'Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.'
    }
  }
  const earmarkIds = earmarks.map((e) => e.earmarkId)
  if (new Set(earmarkIds).size !== earmarkIds.length) {
    return {
      error:
        'Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.'
    }
  }

  const grossAmount = bookingFormGrossAmount(row)
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    return { error: 'Bitte gib einen Betrag größer als 0 € ein.' }
  }
  const internalValidation = getInternalAssignmentValidationState({ budgets, earmarks, isInternal: row.type === 'INTERNAL', grossAmount })
  if (!internalValidation.hasValidAssignments) {
    return { error: internalValidation.budgetHint || internalValidation.earmarkHint }
  }
  const totalBudgetAmount = budgets.reduce((sum, b) => sum + Number(b.amount || 0), 0)
  if (row.type !== 'INTERNAL' && totalBudgetAmount > grossAmount + 0.001) {
    return {
      error: `Die Summe der Budget-Beträge (${totalBudgetAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).`
    }
  }
  const totalEarmarkAmount = earmarks.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  )
  if (row.type !== 'INTERNAL' && totalEarmarkAmount > grossAmount + 0.001) {
    return {
      error: `Die Summe der Zweckbindungs-Beträge (${totalEarmarkAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).`
    }
  }

  const payload: TVoucherUpdateInput = {
    id: Number(row.id),
    date: row.date,
    description: row.description ?? null,
    note: row.note?.trim() ? row.note.trim() : null,
    counterparty: row.counterparty?.trim() || null,
    partyId: row.partyId ?? null,
    type: row.type,
    sphere: row.sphere,
    earmarkId: earmarks.length > 0 ? earmarks[0].earmarkId : null,
    earmarkAmount: earmarks.length > 0 ? earmarks[0].amount : null,
    budgetId: budgets.length > 0 ? budgets[0].budgetId : null,
    budgetAmount: budgets.length > 0 ? budgets[0].amount : null,
    budgets,
    earmarks,
    tags: Array.isArray(row.tags) ? row.tags : []
  }
  if (typeof row.primaryClassificationValueId === 'number') {
    payload.primaryClassificationValueId = row.primaryClassificationValueId
  }

  if (row.type === 'TRANSFER') {
    payload.paymentMethod = null
    payload.paymentAccountId = null
    payload.transferFrom = row.transferFrom ?? null
    payload.transferTo = row.transferTo ?? null
    payload.transferFromAccountId = row.transferFromAccountId ?? null
    payload.transferToAccountId = row.transferToAccountId ?? null
    payload.grossAmount = Number(row.grossAmount || 0)
    payload.vatRate = 0
    payload.amountMode = 'GROSS'
  } else {
    payload.paymentMethod = row.type === 'INTERNAL' ? null : row.paymentMethod ?? null
    payload.paymentAccountId = row.type === 'INTERNAL' ? null : row.paymentAccountId ?? null
    payload.transferFrom = null
    payload.transferTo = null
    payload.transferFromAccountId = null
    payload.transferToAccountId = null
    if (row.type === 'INTERNAL' || (row.mode ?? 'GROSS') === 'GROSS') {
      payload.grossAmount = Number(row.grossAmount || 0)
      payload.vatRate = row.type === 'INTERNAL' ? 0 : Number(row.vatRate ?? 0)
      payload.amountMode = 'GROSS'
    } else {
      payload.netAmount = Number(row.netAmount || 0)
      payload.vatRate = Number(row.vatRate || 0)
      payload.amountMode = 'NET'
    }
  }

  return { payload }
}

export async function persistBookingEdit(payload: TVoucherUpdateInput, files: File[], onUploaded: (file: File) => void) {
  const result = await window.api.vouchers.update(payload)
  for (const file of files) {
    const encoded = await encodeFileForUpload(file)
    await window.api.attachments.add({
      voucherId: payload.id, fileName: encoded.name, dataBytes: encoded.dataBytes, mimeType: encoded.mime
    })
    onUploaded(file)
  }
  return result
}
