export type InvoiceAiGuidance = {
  instructions?: string
  defaults?: {
    type?: 'IN' | 'OUT'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
  }
}

export function hasInvoiceAiGuidance(guidance?: InvoiceAiGuidance) {
  return Boolean(guidance?.instructions?.trim() || Object.keys(guidance?.defaults || {}).length)
}
