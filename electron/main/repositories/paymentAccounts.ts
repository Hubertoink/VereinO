import Database from 'better-sqlite3'
import { getDb } from '../db/database'

type DB = InstanceType<typeof Database>

export type PaymentAccountKind = 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'

export type PaymentAccountRow = {
  id: number
  name: string
  kind: PaymentAccountKind
  iban?: string | null
  color?: string | null
  sortOrder: number
  isActive: number
}

export function paymentMethodForAccountKind(kind?: PaymentAccountKind | null): 'BAR' | 'BANK' | null {
  if (!kind) return null
  return kind === 'CASH' ? 'BAR' : 'BANK'
}

export function listPaymentAccounts(opts?: { activeOnly?: boolean }) {
  const d = getDb()
  const whereSql = opts?.activeOnly ? 'WHERE is_active = 1' : ''
  return d.prepare(`
    SELECT
      id,
      name,
      kind,
      iban,
      color,
      sort_order as sortOrder,
      is_active as isActive
    FROM payment_accounts
    ${whereSql}
    ORDER BY is_active DESC, sort_order ASC, name COLLATE NOCASE ASC, id ASC
  `).all() as PaymentAccountRow[]
}

export function getPaymentAccountById(id: number, d: DB = getDb()) {
  return d.prepare(`
    SELECT
      id,
      name,
      kind,
      iban,
      color,
      sort_order as sortOrder,
      is_active as isActive
    FROM payment_accounts
    WHERE id = ?
  `).get(id) as PaymentAccountRow | undefined
}

export function getDefaultPaymentAccountIdForMethod(method: 'BAR' | 'BANK', d: DB = getDb()) {
  const kind = method === 'BAR' ? 'CASH' : 'BANK'
  const row = d.prepare(`
    SELECT id
    FROM payment_accounts
    WHERE kind = ? AND is_active = 1
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
  `).get(kind) as { id: number } | undefined
  return row?.id ?? null
}

export function upsertPaymentAccount(input: {
  id?: number
  name: string
  kind: PaymentAccountKind
  iban?: string | null
  color?: string | null
  sortOrder?: number
  isActive?: boolean
}) {
  const d = getDb()
  const name = String(input.name || '').trim()
  if (!name) throw new Error('Kontoname ist erforderlich.')
  const resolvedSortOrder = (() => {
    const requested = Number(input.sortOrder)
    if (Number.isFinite(requested) && requested > 0) return Math.floor(requested)
    const row = d.prepare('SELECT COALESCE(MAX(sort_order), 0) as maxSortOrder FROM payment_accounts').get() as { maxSortOrder?: number } | undefined
    return Math.max(1, Number(row?.maxSortOrder || 0) + 1)
  })()
  if (input.id) {
    d.prepare(`
      UPDATE payment_accounts
      SET name = ?, kind = ?, iban = ?, color = ?, sort_order = ?, is_active = ?
      WHERE id = ?
    `).run(name, input.kind, input.iban ?? null, input.color ?? null, resolvedSortOrder, input.isActive === false ? 0 : 1, input.id)
    return { id: input.id }
  }
  const info = d.prepare(`
    INSERT INTO payment_accounts(name, kind, iban, color, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, input.kind, input.iban ?? null, input.color ?? null, resolvedSortOrder, input.isActive === false ? 0 : 1)
  return { id: Number(info.lastInsertRowid) }
}

export function deletePaymentAccount(id: number) {
  const d = getDb()
  const usage = d.prepare(`
    SELECT EXISTS(
      SELECT 1
      FROM vouchers
      WHERE payment_account_id = ? OR transfer_from_account_id = ? OR transfer_to_account_id = ?
    ) as inUse
  `).get(id, id, id) as { inUse?: number } | undefined
  if (usage?.inUse) {
    throw new Error('Dieses Konto wird bereits in Buchungen verwendet und kann nicht gelöscht werden.')
  }
  d.prepare('DELETE FROM payment_accounts WHERE id = ?').run(id)
  return { id }
}