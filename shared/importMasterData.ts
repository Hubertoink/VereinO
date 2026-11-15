import { z } from 'zod'

export const ImportMasterRowSchema = z.object({
  id: z.string(),
  entity: z.enum(['paymentAccounts', 'tags', 'categories', 'budgets', 'earmarks']),
  sourceSheet: z.string(),
  sourceRow: z.number(),
  reference: z.string(),
  name: z.string(),
  kind: z.string().default(''),
  year: z.string().default(''),
  amountPlanned: z.string().default(''),
  sphere: z.string().default(''),
  category: z.string().default(''),
  code: z.string().default(''),
  existingId: z.number().optional(),
  status: z.enum(['existing', 'new', 'error']).default('new'),
  issues: z.array(z.string()).default([])
})
export type ImportMasterRow = z.infer<typeof ImportMasterRowSchema>

export const IMPORT_MASTER_SHEETS = {
  paymentAccounts: 'Konten', tags: 'Tags', categories: 'Kategorien', budgets: 'Budgets', earmarks: 'Zweckbindungen'
} as const

export const ACCOUNT_KIND_LABELS = {
  BANK: 'Bankkonto', CASH: 'Barkonto', PAYPAL: 'PayPal', CARD: 'Karte', OTHER: 'Sonstiges'
} as const

export function normalizeAccountKind(value: string): string {
  const key = value.trim().toUpperCase()
  return ({ BANKKONTO: 'BANK', BARKONTO: 'CASH', BAR: 'CASH', KASSE: 'CASH', BARKASSE: 'CASH', KARTE: 'CARD', SONSTIGES: 'OTHER' } as Record<string, string>)[key] || key
}

export function importNumber(value: string): number | undefined {
  const raw = value.trim()
  if (!raw) return undefined
  const number = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw)
  return Number.isFinite(number) ? number : undefined
}
