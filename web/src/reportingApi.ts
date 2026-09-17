import type { RendererApi } from '../../src/types/api'
import {
  buildDashboardMonths,
  dashboardMonths
} from '../../src/renderer/views/DashboardPlus/dashboardPlusModel'
import type { Entry } from './api'
import { filteredBookings, summarizeBookings } from './rendererApi'

type Filters = Parameters<RendererApi['reports']['summary']>[0]

function amounts(cents: number) {
  if (!Number.isSafeInteger(cents))
    throw new Error('Die Summe überschreitet den unterstützten Betragsbereich.')
  return { net: cents / 100, vat: 0, gross: cents / 100 }
}

/** Desktop summary amounts retain their booking kind; IN − OUT is the balance. */
export function reportSummaryBookings(entries: Entry[], filters: Filters = {}, profile: 'NONPROFIT' | 'GENERAL' = 'NONPROFIT') {
  const rows = filteredBookings(entries, filters)
  return {
    ...summarizeBookings(entries, filters, profile),
    // The web store has payment methods, not individually managed bank accounts.
    // Null accountId intentionally groups these by the real method label.
    byPaymentAccount: (['BANK', 'CASH'] as const).map((method) => ({
      accountId: null,
      key: method === 'BANK' ? 'Bank' : 'Kasse',
      kind: method,
      color: null,
      ...amounts(
        rows
          .filter((row) => row.paymentMethod === method)
          .reduce((total, row) => total + row.grossAmountCents, 0)
      )
    }))
  }
}

/** Monthly chart buckets follow Electron's signed cash-flow contract. */
export function monthlyBookings(entries: Entry[], filters: Filters = {}) {
  const buckets = new Map<string, number>()
  for (const row of filteredBookings(entries, filters)) {
    const month = row.date.slice(0, 7)
    const cents =
      (buckets.get(month) || 0) +
      (row.type === 'OUT' ? -row.grossAmountCents : row.grossAmountCents)
    amounts(cents)
    buckets.set(month, cents)
  }
  return {
    buckets: [...buckets]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cents]) => ({ month, ...amounts(cents) }))
  }
}

export function overviewMonths(entries: Entry[], today: string) {
  const income = monthlyBookings(entries, { to: today, type: 'IN' }).buckets
  const expense = monthlyBookings(entries, { to: today, type: 'OUT' }).buckets
  const first = [...income, ...expense].map((row) => row.month).sort()[0] || today.slice(0, 7)
  const count =
    (Number(today.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
    Number(today.slice(5, 7)) -
    Number(first.slice(5, 7)) +
    1
  return buildDashboardMonths(dashboardMonths(today, Math.max(12, count)), income, expense, 0)
}

/** Bind a fetched, authorized snapshot so every chart uses the same revision. */
export function createReportingReadApi(entries: Entry[], profile: 'NONPROFIT' | 'GENERAL' = 'NONPROFIT') {
  return {
    summary: async (filters: Filters = {}) => reportSummaryBookings(entries, filters, profile),
    monthly: async (filters: Filters = {}) => monthlyBookings(entries, filters),
    years: async () => ({
      years: [...new Set(entries.map((row) => Number(row.date.slice(0, 4))))].sort((a, b) => b - a)
    })
  }
}
