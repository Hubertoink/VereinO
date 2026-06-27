import type { EditVoucherRow, VoucherRow } from '../types'

type VoucherAssignmentPayload = { budgetId: number; amount: number }
type EarmarkAssignmentPayload = { earmarkId: number; amount: number }

export type VoucherUpdatePayload = {
    id: number
    date: string
    description: string | null
    note: string | null
    type: EditVoucherRow['type']
    sphere: EditVoucherRow['sphere']
    earmarkId: number | null
    earmarkAmount: number | null
    budgetId: number | null
    budgetAmount: number | null
    budgets: VoucherAssignmentPayload[]
    earmarks: EarmarkAssignmentPayload[]
    tags: string[]
    paymentMethod?: EditVoucherRow['paymentMethod'] | null
    paymentAccountId: number | null
    transferFrom: EditVoucherRow['transferFrom'] | null
    transferTo: EditVoucherRow['transferTo'] | null
    transferFromAccountId: number | null
    transferToAccountId: number | null
    grossAmount?: number
    netAmount?: number
    vatRate?: number
    amountMode?: EditVoucherRow['mode']
}

export function serializeEditRow(row: EditVoucherRow | null): string | null {
    if (!row) return null

    return JSON.stringify({
        date: row.date || '',
        type: row.type || null,
        sphere: row.sphere || null,
        description: (row.description || '').trim(),
        note: (row.note || '').trim(),
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
                .map((budget) => ({ budgetId: Number(budget.budgetId || 0), amount: Number(budget.amount || 0) }))
                .sort((a, b) => a.budgetId - b.budgetId || a.amount - b.amount)
            : [],
        earmarksAssigned: Array.isArray(row.earmarksAssigned)
            ? [...row.earmarksAssigned]
                .map((earmark) => ({ earmarkId: Number(earmark.earmarkId || 0), amount: Number(earmark.amount || 0) }))
                .sort((a, b) => a.earmarkId - b.earmarkId || a.amount - b.amount)
            : []
    })
}

export function getVoucherMutationBlockReason(row: Partial<VoucherRow> | null | undefined): string {
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

export function buildVoucherUpdatePayloadFromEditRow(
    editRow: EditVoucherRow,
    budgets: VoucherAssignmentPayload[],
    earmarks: EarmarkAssignmentPayload[]
): VoucherUpdatePayload {
    const payload: VoucherUpdatePayload = {
        id: editRow.id,
        date: editRow.date,
        description: editRow.description ?? null,
        note: editRow.note?.trim() ? editRow.note.trim() : null,
        type: editRow.type,
        sphere: editRow.sphere,
        earmarkId: earmarks.length > 0 ? earmarks[0].earmarkId : null,
        earmarkAmount: earmarks.length > 0 ? earmarks[0].amount : null,
        budgetId: budgets.length > 0 ? budgets[0].budgetId : null,
        budgetAmount: budgets.length > 0 ? budgets[0].amount : null,
        budgets,
        earmarks,
        tags: editRow.tags || [],
        paymentAccountId: null,
        transferFrom: null,
        transferTo: null,
        transferFromAccountId: null,
        transferToAccountId: null
    }

    if (editRow.type === 'TRANSFER') {
        payload.paymentAccountId = null
        payload.transferFrom = editRow.transferFrom ?? null
        payload.transferTo = editRow.transferTo ?? null
        payload.transferFromAccountId = editRow.transferFromAccountId ?? null
        payload.transferToAccountId = editRow.transferToAccountId ?? null
    } else if (editRow.type === 'INTERNAL') {
        payload.paymentAccountId = null
    } else {
        payload.paymentMethod = editRow.paymentMethod ?? null
        payload.paymentAccountId = editRow.paymentAccountId ?? null
    }

    const grossAmount = editRow.grossAmount as unknown
    const netAmount = editRow.netAmount as unknown

    if (editRow.mode === 'GROSS' && grossAmount != null && grossAmount !== '') {
        payload.grossAmount = Number(grossAmount)
        payload.vatRate = 0
        payload.amountMode = 'GROSS'
    } else if (editRow.mode === 'NET' && netAmount != null && netAmount !== '') {
        payload.netAmount = Number(netAmount)
        if (editRow.vatRate != null) payload.vatRate = Number(editRow.vatRate)
        payload.amountMode = 'NET'
    }

    return payload
}
