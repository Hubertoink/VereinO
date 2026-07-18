export const DATA_CHANGE_SCOPES = [
  'vouchers',
  'members',
  'invoices',
  'submissions',
  'bank-imports',
  'budgets',
  'earmarks',
  'tags',
  'parties',
  'organizations',
  'settings'
] as const

export type DataChangeScope = (typeof DATA_CHANGE_SCOPES)[number]
