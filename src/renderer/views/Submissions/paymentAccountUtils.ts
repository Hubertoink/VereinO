export type SubmissionPaymentAccount = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  color?: string | null
  isActive?: number
}

export function getPaymentMethodFromAccountKind(kind?: string | null): 'BAR' | 'BANK' | null {
  if (kind === 'CASH') return 'BAR'
  if (kind === 'BANK' || kind === 'PAYPAL' || kind === 'CARD' || kind === 'OTHER') return 'BANK'
  return null
}

export function getInitialPaymentAccount(accounts: SubmissionPaymentAccount[], fallbackMethod?: 'BAR' | 'BANK' | null) {
  const activeAccounts = accounts.filter((account) => account.isActive !== 0)
  if (fallbackMethod === 'BAR') {
    return activeAccounts.find((account) => account.kind === 'CASH') ?? activeAccounts[0] ?? null
  }
  if (fallbackMethod === 'BANK') {
    return activeAccounts.find((account) => account.kind === 'BANK') ?? activeAccounts.find((account) => account.id !== undefined) ?? activeAccounts[0] ?? null
  }
  return activeAccounts[0] ?? null
}
