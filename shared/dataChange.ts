export const DATA_CHANGE_SCOPES = [
  'vouchers',
  'members',
  'invoices',
  'reimbursements',
  'submissions',
  'bank-imports',
  'budgets',
  'earmarks',
  'tags',
  'parties',
  'organizations',
  'recurring-bookings',
  'settings'
] as const

export type DataChangeScope = (typeof DATA_CHANGE_SCOPES)[number]
