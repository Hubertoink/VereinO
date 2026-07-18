export type VoucherType = 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
export type VoucherSphere = 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
export type PaymentMethod = 'BAR' | 'BANK'
export type PaymentAccountKind = 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
export type AmountMode = 'NET' | 'GROSS'

export type BudgetAssignment = {
    id?: number
    budgetId: number
    amount: number
    label?: string
    color?: string | null
}

export type EarmarkAssignment = {
    id?: number
    earmarkId: number
    amount: number
    code?: string
    name?: string
    color?: string | null
}

export type VoucherRow = {
    id: number
    voucherNo: string
    date: string
    type: VoucherType
    sphere: VoucherSphere
    description?: string | null
    note?: string | null
    counterparty?: string | null
    partyId?: number | null
    isAdvancePlaceholder?: boolean
    isCashCheck?: boolean
    paymentMethod?: PaymentMethod | null
    paymentAccountId?: number | null
    paymentAccountName?: string | null
    paymentAccountKind?: PaymentAccountKind | null
    paymentAccountColor?: string | null
    transferFrom?: PaymentMethod | null
    transferTo?: PaymentMethod | null
    transferFromAccountId?: number | null
    transferFromAccountName?: string | null
    transferFromAccountKind?: PaymentAccountKind | null
    transferFromAccountColor?: string | null
    transferToAccountId?: number | null
    transferToAccountName?: string | null
    transferToAccountKind?: PaymentAccountKind | null
    transferToAccountColor?: string | null
    netAmount: number
    vatRate: number
    vatAmount: number
    grossAmount: number
    amountMode?: AmountMode
    originalId?: number | null
    originalVoucherNo?: string | null
    reversedById?: number | null
    reversedByVoucherNo?: string | null
    hasFiles?: boolean
    earmarkId?: number | null
    earmarkCode?: string | null
    earmarkAmount?: number | null
    budgetId?: number | null
    budgetLabel?: string | null
    budgetAmount?: number | null
    fileCount?: number
    tags?: string[]
    budgets?: BudgetAssignment[]
    earmarksAssigned?: EarmarkAssignment[]
}

export type EditVoucherRow = VoucherRow & {
    mode?: AmountMode
    transferFrom?: PaymentMethod | null
    transferTo?: PaymentMethod | null
}

export type BookingEditTab = {
    id: string
    row: EditVoucherRow
    initialSnapshot: string
    detached?: boolean
}

export type ColKey =
    | 'actions'
    | 'date'
    | 'voucherNo'
    | 'type'
    | 'sphere'
    | 'description'
    | 'note'
    | 'earmark'
    | 'budget'
    | 'paymentMethod'
    | 'attachments'
    | 'net'
    | 'vat'
    | 'gross'

export const DEFAULT_ORDER: ColKey[] = [
    'actions',
    'date',
    'voucherNo',
    'type',
    'sphere',
    'description',
    'note',
    'earmark',
    'budget',
    'paymentMethod',
    'attachments',
    'net',
    'vat',
    'gross'
]

export const LABEL_FOR_COL: Record<ColKey, string> = {
    actions: 'Aktionen',
    date: 'Datum',
    voucherNo: 'Nr.',
    type: 'Art',
    sphere: 'Sphäre',
    description: 'Beschreibung',
    note: 'Kommentar',
    earmark: 'Zweckbindung',
    budget: 'Budget',
    paymentMethod: 'Zahlweg',
    attachments: 'Anhänge',
    net: 'Netto',
    vat: 'MwSt',
    gross: 'Brutto'
}
