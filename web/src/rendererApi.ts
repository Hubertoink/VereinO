import type { RendererApi } from '../../src/types/api'
import type { BookingPlusRow } from '../../src/renderer/views/BookingsPlus/bookingPlusHelpers'
import { api, ApiError, type Entry } from './api'

type ListInput = NonNullable<Parameters<RendererApi['vouchers']['list']>[0]>
type SummaryInput = Parameters<RendererApi['reports']['summary']>[0]
export type WebVoucherRow = BookingPlusRow & { webEntry: Entry }
export const webPaymentAccounts = [
  { id: 1, name: 'Bank' },
  { id: 2, name: 'Kasse' }
]

/** The pilot stores gross cents and has no VAT breakdown or assignment records yet. */
export function toVoucherRow(entry: Entry): WebVoucherRow {
  return {
    id: entry.id,
    voucherNo: entry.number || String(entry.id),
    date: entry.date,
    type: entry.type,
    sphere: entry.sphere,
    primaryClassificationValueId: entry.primaryClassificationValueId,
    primaryClassificationName: entry.primaryClassificationName,
    primaryClassificationColor: entry.primaryClassificationColor,
    description: entry.description,
    counterparty: entry.counterparty || null,
    paymentMethod: entry.paymentMethod === 'CASH' ? 'BAR' : 'BANK',
    paymentAccountId: entry.paymentMethod === 'CASH' ? 2 : 1,
    paymentAccountName: entry.paymentMethod === 'CASH' ? 'Kasse' : 'Bank',
    paymentAccountKind: entry.paymentMethod === 'CASH' ? 'CASH' : 'BANK',
    netAmount: entry.grossAmountCents / 100,
    grossAmount: entry.grossAmountCents / 100,
    vatRate: 0,
    vatAmount: 0,
    fileCount: entry.fileCount || 0,
    tags: entry.tags || [],
    budgets: (entry.budgets || []).map(item => ({ ...item, id: item.budgetId, label: item.label || String(item.budgetId) })),
    earmarksAssigned: (entry.earmarksAssigned || []).map(item => ({ ...item, id: item.earmarkId, code: item.code || '', name: item.name || '' })),
    webEntry: entry
  }
}
const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })
export function filteredBookings(
  entries: Entry[],
  input: Partial<ListInput> | SummaryInput = {}
): Entry[] {
  return entries.filter((entry) => {
    const method = entry.paymentMethod === 'CASH' ? 'BAR' : 'BANK'
    const account = entry.paymentMethod === 'CASH' ? 2 : 1
    if (
      (input.type && entry.type !== input.type) ||
      (input.sphere && entry.sphere !== input.sphere)
    )
      return false
    if ((input.from && entry.date < input.from) || (input.to && entry.date > input.to)) return false
    if (
      (input.paymentMethod && method !== input.paymentMethod) ||
      (input.paymentAccountId != null && input.paymentAccountId !== account)
    )
      return false
    if (input.budgetId && !entry.budgets?.some(item => item.budgetId === input.budgetId)) return false
    if (input.earmarkId && !entry.earmarksAssigned?.some(item => item.earmarkId === input.earmarkId)) return false
    if (input.tag && !entry.tags?.includes(input.tag)) return false
    if (input.primaryClassificationValueId != null && input.primaryClassificationValueId !== entry.primaryClassificationValueId) return false
    if ('hasFiles' in input && input.hasFiles && !entry.fileCount) return false
    if ('voucherIds' in input && input.voucherIds && !input.voucherIds.includes(entry.id))
      return false
    const query = input.q?.trim().toLocaleLowerCase('de') || ''
    if (/^#\d+$/.test(query)) return entry.id === Number(query.slice(1))
    const date = new Date(`${entry.date}T12:00:00`)
    const search = [
      entry.number,
      entry.id,
      entry.description,
      entry.counterparty,
      ...(entry.tags || []),
      entry.primaryClassificationName,
      entry.date,
      date.toLocaleDateString('de-DE'),
      date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    ]
      .join(' ')
      .toLocaleLowerCase('de')
    return query.split(/\s+/).every((word) => search.includes(word))
  })
}
export function listBookings(entries: Entry[], input: Partial<ListInput> = {}) {
  const filtered = filteredBookings(entries, input)
  const direction = input.sort === 'ASC' ? 1 : -1
  filtered.sort((a, b) => {
    let order: number
    switch (input.sortBy) {
      case 'gross':
      case 'net':
        order = a.grossAmountCents - b.grossAmountCents
        break
      case 'description':
        order = collator.compare(a.description, b.description)
        break
      case 'payment':
        order = collator.compare(
          a.paymentMethod === 'CASH' ? 'Kasse' : 'Bank',
          b.paymentMethod === 'CASH' ? 'Kasse' : 'Bank'
        )
        break
      case 'sphere':
        order = collator.compare(a.sphere, b.sphere)
        break
      default:
        order = a.date.localeCompare(b.date)
    }
    return direction * (order || a.id - b.id)
  })
  const offset = Math.max(0, Math.trunc(input.offset || 0))
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit || 20)))
  return { total: filtered.length, rows: filtered.slice(offset, offset + limit).map(toVoucherRow) }
}
export function summarizeBookings(
  entries: Entry[],
  input: SummaryInput = {},
  profile: 'NONPROFIT' | 'GENERAL' = 'NONPROFIT'
): Awaited<ReturnType<RendererApi['reports']['summary']>> {
  const filtered = filteredBookings(entries, input)
  const sum = (rows: Entry[]) => {
    const cents = rows.reduce(
      (total, entry) =>
        total + entry.grossAmountCents,
      0
    )
    if (!Number.isSafeInteger(cents))
      throw new Error('Die Summe überschreitet den unterstützten Betragsbereich.')
    return { net: cents / 100, vat: 0, gross: cents / 100 }
  }
  return {
    totals: sum(filtered),
    byType: (['IN', 'OUT'] as const).map((key) => ({
      key,
      ...sum(filtered.filter((entry) => entry.type === key))
    })),
    bySphere: (['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const).map((key) => ({
      key,
      ...sum(filtered.filter((entry) => entry.sphere === key))
    })),
    byPaymentMethod: (['BANK', 'BAR'] as const).map((key) => ({
      key,
      ...sum(filtered.filter((entry) => entry.paymentMethod === (key === 'BAR' ? 'CASH' : 'BANK')))
    })),
    byPrimaryClassification: profile === 'GENERAL' ? [...new Set(filtered.map(row => row.primaryClassificationValueId ?? null))].map(id => {
      const rows = filtered.filter(row => (row.primaryClassificationValueId ?? null) === id)
      return { key: rows[0]?.primaryClassificationName || 'Ohne Kategorie', color: rows[0]?.primaryClassificationColor || null, ...sum(rows) }
    }) : [],
    classificationProfile: profile,
    primaryClassificationLabel: profile === 'GENERAL' ? 'Kategorie' : 'Sphäre'
  }
}

/** Only the read contracts used by shared views are bridged. No no-op mutation APIs. */
export function createRendererReadApi(onSessionExpired: () => void, profile: 'NONPROFIT' | 'GENERAL' = 'NONPROFIT') {
  let active = true
  let pending: Promise<Entry[]> | null = null
  async function bookings() {
    if (!pending) {
      pending = api<{ bookings: Entry[] }>('/bookings')
        .then((result) => result.bookings)
        .catch((error) => {
          if (active && error instanceof ApiError && error.status === 401) onSessionExpired()
          throw error
        })
        .finally(() => {
          pending = null
        })
    }
    return pending
  }
  const bridge = {
    vouchers: { list: async (input?: ListInput) => listBookings(await bookings(), input) },
    reports: { summary: async (input: SummaryInput) => summarizeBookings(await bookings(), input, profile) },
    classifications: {
      primary: {
        list: async () => api<Awaited<ReturnType<RendererApi['classifications']['primary']['list']>>>('/classifications/primary')
      }
    },
    organizations: {
      onSwitched: (listener: () => void) => {
        window.addEventListener('web-session-changed', listener)
        return () => window.removeEventListener('web-session-changed', listener)
      }
    }
  }
  return {
    bridge,
    dispose: () => {
      active = false
    }
  }
}
