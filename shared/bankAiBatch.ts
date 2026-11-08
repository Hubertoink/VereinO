export type BankTransaction = {
  id: number
  bookingDate: string
  valueDate?: string | null
  direction: 'IN' | 'OUT'
  amount: number
  currency: string
  counterparty?: string | null
  counterpartyIban?: string | null
  purpose?: string | null
  endToEndId?: string | null
  bankReference?: string | null
  status: 'OPEN' | 'LINKED' | 'CHECKED'
  paymentAccountId: number
  paymentAccountName: string
  paymentAccountColor?: string | null
  voucherId?: number | null
  voucherNo?: string | null
  voucherDescription?: string | null
  voucherReversedById?: number | null
  linkOrigin?: 'EXISTING' | 'CREATED' | null
  checkedNote?: string | null
  resolvedAt?: string | null
  sourceFileName: string
  matchScore?: number | null
  possibleDuplicateCount?: number
  aiSuggestion?: BankAiSuggestion | null
}

export type BankAiSuggestion = {
  matchedVoucher?: { grossAmount: number; date: string; description: string | null } | null
  action: 'LINK_EXISTING' | 'APPLY_RECURRING' | 'CREATE_BOOKING' | 'MARK_CHECKED' | 'NEEDS_MANUAL_REVIEW'
  confidence: number
  reason: string
  voucherId?: number | null
  voucherNo?: string | null
  recurringBookingId?: number | null
  recurringBookingName?: string | null
  occurrenceId?: number | null
  scheduledDate?: string | null
  bookingCandidate?: {
    note?: string | null
    date: string
    type: 'IN' | 'OUT'
    sphere: string
    primaryClassificationValueId?: number | null
    counterparty?: string | null
    description: string
    grossAmount: number
    vatRate?: number | null
    paymentMethod?: string | null
    paymentAccountId?: number | null
    budgets?: Array<{ id: number; amount: number }>
    earmarks?: Array<{ id: number; amount: number }>
    tags?: string[]
  } | null
  warnings: string[]
  evidence: string[]
  reviewedAt?: string | null
}

export type BankBookingCandidate = NonNullable<BankAiSuggestion['bookingCandidate']>

export type BankAiBatchRow = {
  commentsEnabled: boolean
  transaction: BankTransaction
  token: string
  blockers: string[]
  warnings: string[]
  candidate: BankBookingCandidate | null
  targetDescription: string
}

export type BankAiBatchApplyInput = {
  id: number
  token: string
  candidate?: BankBookingCandidate
}

export type BankAiBatchResult = { voucherId: number; voucherNo: string; warnings: string[] }
