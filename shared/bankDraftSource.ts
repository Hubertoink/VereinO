/** Original imported values retained only for drafts opened from an AI bank review. */
export type BankDraftSource = {
  transactionId: number
  bookingDate: string
  valueDate?: string | null
  direction: 'IN' | 'OUT'
  amount: number
  currency: string
  counterparty?: string | null
  counterpartyIban?: string | null
  purpose?: string | null
  bankReference?: string | null
  paymentAccountName?: string | null
  sourceFileName?: string | null
}

export function bankDraftSourceFromTransaction(transaction: Record<string, unknown>, id?: number): BankDraftSource | undefined {
  if (typeof transaction.bookingDate !== 'string' || typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || !['IN', 'OUT'].includes(String(transaction.direction))) return undefined
  const text = (key: string) => typeof transaction[key] === 'string' ? transaction[key] as string : null
  return {
    transactionId: Number(id ?? transaction.id),
    bookingDate: transaction.bookingDate,
    valueDate: text('valueDate'),
    direction: transaction.direction as 'IN' | 'OUT',
    amount: transaction.amount,
    currency: text('currency') || 'EUR',
    counterparty: text('counterparty'),
    counterpartyIban: text('counterpartyIban'),
    purpose: text('purpose'),
    bankReference: text('bankReference'),
    paymentAccountName: text('paymentAccountName'),
    sourceFileName: text('sourceFileName')
  }
}
