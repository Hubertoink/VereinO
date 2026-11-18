import type { QA } from '../hooks/useQuickAdd'

export function selectDraftBookingType(draft: QA, type: QA['type']): QA {
  const next = { ...draft, type, bookingTypeSelected: true }
  if (type === 'TRANSFER' || type === 'INTERNAL') {
    next.mode = 'GROSS'
    next.vatRate = 0
    next.paymentAccountId = null
    next.paymentAccountName = null
    next.paymentMethod = undefined
  }
  if (type !== 'TRANSFER') {
    next.transferFromAccountId = null
    next.transferFromAccountName = null
    next.transferFrom = undefined
    next.transferToAccountId = null
    next.transferToAccountName = null
    next.transferTo = undefined
  }
  return next
}
