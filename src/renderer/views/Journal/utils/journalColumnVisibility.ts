export type JournalColKey = 'actions' | 'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'earmark' | 'budget' | 'paymentMethod' | 'attachments' | 'net' | 'vat' | 'gross'

export function getEffectiveJournalCols(cols: Record<JournalColKey, boolean>, allowVoucherDeletion: boolean): Record<JournalColKey, boolean> {
  const next = { ...cols }
  if (!allowVoucherDeletion) {
    next.actions = false
  }
  return next
}

export function getEffectiveJournalOrder(order: JournalColKey[], allowVoucherDeletion: boolean): JournalColKey[] {
  if (allowVoucherDeletion) return order
  return order.filter((key) => key !== 'actions')
}

export function shouldShowReverseAction(
  voucher: { originalId?: number | null; reversedById?: number | null },
  allowVoucherDeletion: boolean
): boolean {
  return !allowVoucherDeletion && !voucher.originalId && !voucher.reversedById
}
