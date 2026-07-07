export type JournalColKey = 'actions' | 'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'note' | 'earmark' | 'budget' | 'paymentMethod' | 'attachments' | 'net' | 'vat' | 'gross'

const DEFAULT_JOURNAL_COLS: Record<JournalColKey, boolean> = {
  actions: true,
  date: true,
  voucherNo: true,
  type: true,
  sphere: true,
  description: true,
  note: true,
  earmark: true,
  budget: true,
  paymentMethod: true,
  attachments: true,
  net: true,
  vat: true,
  gross: true
}

const DEFAULT_JOURNAL_ORDER: JournalColKey[] = ['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']

export function getDefaultJournalCols(): Record<JournalColKey, boolean> {
  return { ...DEFAULT_JOURNAL_COLS }
}

export function getDefaultJournalOrder(): JournalColKey[] {
  return [...DEFAULT_JOURNAL_ORDER]
}

export function getEffectiveJournalCols(cols: Record<JournalColKey, boolean>, allowVoucherDeletion: boolean): Record<JournalColKey, boolean> {
  const next = { ...getDefaultJournalCols(), ...cols }
  if (!allowVoucherDeletion) {
    next.actions = false
  }
  return next
}

export function getEffectiveJournalOrder(order: JournalColKey[], allowVoucherDeletion: boolean): JournalColKey[] {
  const base = (allowVoucherDeletion ? order : order.filter((key) => key !== 'actions')).filter((key): key is JournalColKey => Boolean(key) && key in getDefaultJournalCols())
  const defaultOrder = getDefaultJournalOrder().filter((key) => allowVoucherDeletion || key !== 'actions')
  const missing = defaultOrder.filter((key) => !base.includes(key))
  return [...base, ...missing]
}
