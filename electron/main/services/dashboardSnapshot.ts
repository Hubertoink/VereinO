import type { DataChangeScope } from '../../../shared/dataChange'
import type {
  DashboardSnapshot,
  DashboardSnapshotInput
} from '../../../shared/dashboard'
import { getCurrentDbInfo, getDb } from '../db/database'
import { dueSummary } from '../repositories/members_payments'
import { listVoucherYears } from '../repositories/vouchers'

const CACHE_TTL_MS = 2_500
const MAX_CACHE_ENTRIES = 12
const cache = new Map<string, { expiresAt: number; value: DashboardSnapshot }>()
const DASHBOARD_SCOPES = new Set<DataChangeScope>([
  'vouchers',
  'members',
  'invoices',
  'submissions',
  'bank-imports',
  'budgets',
  'earmarks',
  'settings',
  'organizations'
])

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function financialSummaries(input: DashboardSnapshotInput) {
  const row = getDb().prepare(`
    SELECT
      IFNULL(SUM(CASE WHEN date >= ? AND date <= ? AND type = 'IN' THEN gross_amount ELSE 0 END), 0) AS inGross,
      IFNULL(SUM(CASE WHEN date >= ? AND date <= ? AND type = 'OUT' THEN gross_amount ELSE 0 END), 0) AS outGross,
      IFNULL(SUM(CASE WHEN ? IS NOT NULL AND date <= ? AND type = 'IN' THEN gross_amount ELSE 0 END), 0) AS openingIn,
      IFNULL(SUM(CASE WHEN ? IS NOT NULL AND date <= ? AND type = 'OUT' THEN gross_amount ELSE 0 END), 0) AS openingOut
    FROM vouchers
    WHERE type IN ('IN', 'OUT')
  `).get(
    input.from, input.to,
    input.from, input.to,
    input.openingTo ?? null, input.openingTo ?? null,
    input.openingTo ?? null, input.openingTo ?? null
  ) as { inGross?: number; outGross?: number; openingIn?: number; openingOut?: number }
  const inGross = Number(row?.inGross || 0)
  const outGross = Math.abs(Number(row?.outGross || 0))
  const openingIn = Number(row?.openingIn || 0)
  const openingOut = Math.abs(Number(row?.openingOut || 0))
  return {
    financial: { inGross, outGross, diff: round2(inGross - outGross) },
    openingSaldo: round2(openingIn - openingOut)
  }
}

function memberStats() {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END) AS newCount,
      SUM(CASE WHEN status = 'PAUSED' THEN 1 ELSE 0 END) AS paused,
      SUM(CASE WHEN status = 'LEFT' THEN 1 ELSE 0 END) AS left
    FROM members
  `).get() as Record<string, number>
  return {
    total: Number(row?.total || 0),
    active: Number(row?.active || 0),
    new: Number(row?.newCount || 0),
    paused: Number(row?.paused || 0),
    left: Number(row?.left || 0)
  }
}

function invoiceStats(today: string) {
  const db = getDb()
  const current = new Date(`${today}T00:00:00Z`)
  const plusFive = new Date(current)
  plusFive.setUTCDate(plusFive.getUTCDate() + 5)
  const yesterday = new Date(current)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const plusFiveIso = plusFive.toISOString().slice(0, 10)
  const yesterdayIso = yesterday.toISOString().slice(0, 10)

  const aggregate = db.prepare(`
    WITH invoice_state AS (
      SELECT
        i.id,
        i.due_date AS dueDate,
        MAX(0, i.gross_amount - IFNULL(SUM(p.amount), 0)) AS remaining
      FROM invoices i
      LEFT JOIN invoice_payments p ON p.invoice_id = i.id
      GROUP BY i.id
      HAVING remaining > 0.000001
    )
    SELECT
      COUNT(*) AS openCount,
      IFNULL(SUM(remaining), 0) AS openRemaining,
      SUM(CASE WHEN dueDate >= ? AND dueDate <= ? THEN 1 ELSE 0 END) AS dueSoonCount,
      IFNULL(SUM(CASE WHEN dueDate >= ? AND dueDate <= ? THEN remaining ELSE 0 END), 0) AS dueSoonRemaining,
      SUM(CASE WHEN dueDate <= ? THEN 1 ELSE 0 END) AS overdueCount,
      IFNULL(SUM(CASE WHEN dueDate <= ? THEN remaining ELSE 0 END), 0) AS overdueRemaining
    FROM invoice_state
  `).get(today, plusFiveIso, today, plusFiveIso, yesterdayIso, yesterdayIso) as Record<string, number>

  const topDue = db.prepare(`
    SELECT
      i.id,
      i.party,
      i.due_date AS dueDate,
      MAX(0, i.gross_amount - IFNULL(SUM(p.amount), 0)) AS remaining
    FROM invoices i
    LEFT JOIN invoice_payments p ON p.invoice_id = i.id
    WHERE i.due_date IS NOT NULL
    GROUP BY i.id
    HAVING remaining > 0.000001
    ORDER BY i.due_date ASC, i.id ASC
    LIMIT 5
  `).all() as DashboardSnapshot['invoices']['topDue']

  return {
    open: {
      count: Number(aggregate?.openCount || 0),
      remaining: round2(Number(aggregate?.openRemaining || 0))
    },
    dueSoon: {
      count: Number(aggregate?.dueSoonCount || 0),
      remaining: round2(Number(aggregate?.dueSoonRemaining || 0))
    },
    overdue: {
      count: Number(aggregate?.overdueCount || 0),
      remaining: round2(Number(aggregate?.overdueRemaining || 0))
    },
    topDue: topDue.map((row) => ({ ...row, remaining: round2(Number(row.remaining || 0)) }))
  }
}

function taskStats() {
  const row = getDb().prepare(`
    SELECT
      (SELECT COUNT(*) FROM bank_transactions WHERE status = 'OPEN') AS bankOpenCount,
      (SELECT MAX(booking_date) FROM bank_transactions) AS lastBookingDate,
      (SELECT COUNT(*) FROM bank_transactions) AS bankTotal,
      (SELECT MAX(created_at) FROM bank_import_batches) AS lastImportAt,
      (SELECT COUNT(*) FROM submissions WHERE status = 'pending') AS pendingSubmissions
  `).get() as {
    bankOpenCount?: number
    lastBookingDate?: string | null
    bankTotal?: number
    lastImportAt?: string | null
    pendingSubmissions?: number
  }
  return {
    bankOpenCount: Number(row?.bankOpenCount || 0),
    bankImportStatus: {
      lastBookingDate: row?.lastBookingDate ?? null,
      lastImportAt: row?.lastImportAt ?? null,
      total: Number(row?.bankTotal || 0)
    },
    dueMembershipFees: dueSummary(),
    pendingSubmissions: Number(row?.pendingSubmissions || 0)
  }
}

function organizationSettings() {
  const rows = getDb().prepare(`
    SELECT key, value_json AS valueJson
    FROM settings
    WHERE key IN ('org.cashier', 'org.logoDataUrl')
  `).all() as Array<{ key: string; valueJson: string }>
  const values = new Map(rows.map((row) => {
    try { return [row.key, JSON.parse(row.valueJson)] as const } catch { return [row.key, ''] as const }
  }))
  return {
    cashier: String(values.get('org.cashier') || ''),
    logoDataUrl: String(values.get('org.logoDataUrl') || '')
  }
}

function activeCards(today: string) {
  const db = getDb()
  const activeBudgets = db.prepare(`
    SELECT id, name, amount_planned AS amountPlanned, sphere,
      start_date AS startDate, end_date AS endDate, color
    FROM budgets
    WHERE is_archived = 0
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
    ORDER BY COALESCE(end_date, '9999-12-31') ASC, id ASC
    LIMIT 2
  `).all(today, today) as DashboardSnapshot['activeBudgets']
  const activeEarmarks = db.prepare(`
    SELECT id, code, name, end_date AS endDate, color
    FROM earmarks
    WHERE is_active = 1
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
    ORDER BY COALESCE(end_date, '9999-12-31') ASC, id ASC
    LIMIT 2
  `).all(today, today) as DashboardSnapshot['activeEarmarks']
  return { activeBudgets, activeEarmarks }
}

function cacheKey(input: DashboardSnapshotInput) {
  return `${getCurrentDbInfo().dbPath}\u0000${JSON.stringify(input)}`
}

export function clearDashboardSnapshotCache(scopes?: DataChangeScope[]) {
  if (!scopes?.length || scopes.some((scope) => DASHBOARD_SCOPES.has(scope))) cache.clear()
}

export function getDashboardSnapshot(input: DashboardSnapshotInput): DashboardSnapshot {
  const key = cacheKey(input)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  const financial = financialSummaries(input)
  const cards = activeCards(input.today)
  const value: DashboardSnapshot = {
    ...financial,
    years: listVoucherYears(),
    organization: organizationSettings(),
    members: memberStats(),
    invoices: invoiceStats(input.today),
    tasks: taskStats(),
    ...cards
  }

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value })
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
  return value
}
