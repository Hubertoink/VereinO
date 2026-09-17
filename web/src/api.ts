let activeOrganizationId: number | undefined
export function setActiveOrganization(id?: number) { activeOrganizationId = id }
export function webFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (activeOrganizationId !== undefined) headers.set('X-VereinO-Organization', String(activeOrganizationId))
  return fetch(input, { ...init, headers })
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await webFetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'X-VereinO-Request': '1' })
    },
    body: data === undefined ? undefined : JSON.stringify(data)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.message ||
        result.error ||
        (response.status === 409
          ? 'Dieser Eintrag wurde inzwischen geändert. Bitte lade ihn erneut.'
          : 'Die Anfrage konnte nicht verarbeitet werden.')
    )
  return result as T
}
export type Role = 'ADMIN' | 'EDITOR' | 'USER'
export type User = {
  id: number
  email: string
  role: Role
  organizationId: number
  organizationName?: string
  isActive?: boolean
}
export type Fields = {
  tags?: string[]
  budgets?: Array<{ budgetId: number; amount: number; label?: string; color?: string | null }>
  earmarksAssigned?: Array<{ earmarkId: number; amount: number; code?: string; name?: string; color?: string | null }>
  primaryClassificationValueId?: number | null
  date: string
  type: 'IN' | 'OUT'
  description: string
  grossAmountCents: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  paymentMethod: 'BANK' | 'CASH'
  counterparty?: string
}
export type Entry = Fields & {
  primaryClassificationName?: string | null
  primaryClassificationColor?: string | null
  id: number
  version: number
  number?: string
  status?: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED'
  createdBy?: number
  createdByEmail?: string
  budgets?: Array<{ budgetId: number; amount: number; label?: string; color?: string | null }>
  earmarksAssigned?: Array<{ earmarkId: number; amount: number; code?: string; name?: string; color?: string | null }>
  fileCount?: number
  reviewReason?: string
}
export const roleNames: Record<Role, string> = { ADMIN: 'Admin', EDITOR: 'Editor', USER: 'User' }
export const money = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
export function parseCents(value: string): number {
  const normalized = value.trim().replace(/\s/g, '')
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized))
    throw new Error(
      'Bitte einen positiven Betrag ohne Tausendertrennzeichen eingeben, z. B. 1250,50.'
    )
  const [whole, decimal = ''] = normalized.split(/[,.]/)
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new Error('Bitte einen gültigen Betrag größer als 0 eingeben.')
  return cents
}
