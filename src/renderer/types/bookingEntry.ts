export type QA = {
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    primaryClassificationValueId?: number | null
    grossAmount?: number
    netAmount?: number
    vatRate: number
    description: string
    note?: string | null
    counterparty?: string | null
    partyId?: number | null
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    paymentAccountName?: string | null
    mode?: 'NET' | 'GROSS'
    transferFrom?: 'BAR' | 'BANK'
    transferTo?: 'BAR' | 'BANK'
    transferFromAccountId?: number | null
    transferFromAccountName?: string | null
    transferToAccountId?: number | null
    transferToAccountName?: string | null
    budgetId?: number | null
    earmarkId?: number | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarksAssigned?: Array<{ earmarkId: number; amount: number }>
    tags?: string[]
    bankTransactionId?: number
}
