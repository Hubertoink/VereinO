import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'
import { createVoucher, deleteVoucher } from './vouchers'

type DB = InstanceType<typeof Database>

type AdvanceStatus = 'OPEN' | 'RESOLVED'

type AdvancePurchaseType = 'IN' | 'OUT'

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function listAdvances(params?: {
  q?: string
  status?: AdvanceStatus | 'ALL'
  memberId?: number
  limit?: number
  offset?: number
}) {
  const d = getDb()
  const wh: string[] = []
  const vals: any[] = []

  if (params?.q && params.q.trim()) {
    const like = `%${params.q.trim()}%`
    wh.push('(a.recipient_name LIKE ? OR IFNULL(m.name, "") LIKE ? OR IFNULL(a.notes, "") LIKE ?)')
    vals.push(like, like, like)
  }
  if (params?.memberId != null) {
    wh.push('a.member_id = ?')
    vals.push(params.memberId)
  }

  const whereSql = wh.length ? `WHERE ${wh.join(' AND ')}` : ''
  const statusSql =
    params?.status === 'OPEN'
      ? "HAVING IFNULL(a.resolved_at, '') = ''"
      : params?.status === 'RESOLVED'
      ? "HAVING IFNULL(a.resolved_at, '') <> ''"
      : ''

  const limit = Math.max(1, Math.min(200, Number(params?.limit || 50)))
  const offset = Math.max(0, Number(params?.offset || 0))

  const baseSql = `
    FROM member_advances a
    LEFT JOIN members m ON m.id = a.member_id
    LEFT JOIN member_advance_settlements s ON s.advance_id = a.id
    LEFT JOIN member_advance_purchases p ON p.advance_id = a.id
    ${whereSql}
    GROUP BY a.id
    ${statusSql}
  `

  const rows = d.prepare(`
    SELECT
      a.id,
      a.member_id as memberId,
      a.recipient_name as recipientName,
      a.issued_at as issuedAt,
      a.amount as amount,
      a.notes as notes,
      a.budget_id as budgetId,
      a.earmark_id as earmarkId,
      a.placeholder_voucher_id as placeholderVoucherId,
      a.resolved_at as resolvedAt,
      a.created_at as createdAt,
      IFNULL(m.name, a.recipient_name) as memberName,
      IFNULL(SUM(s.amount), 0) as settledAmount,
      IFNULL(SUM(CASE WHEN p.voucher_id IS NULL AND p.type = 'OUT' THEN p.gross_amount ELSE 0 END), 0)
        - IFNULL(SUM(CASE WHEN p.voucher_id IS NULL AND p.type = 'IN' THEN p.gross_amount ELSE 0 END), 0) as purchaseAmount,
      (a.amount - (
        IFNULL(SUM(CASE WHEN p.voucher_id IS NULL AND p.type = 'OUT' THEN p.gross_amount ELSE 0 END), 0)
        - IFNULL(SUM(CASE WHEN p.voucher_id IS NULL AND p.type = 'IN' THEN p.gross_amount ELSE 0 END), 0)
      )) as openAmount,
      COUNT(s.id) as settlementCount,
      COUNT(p.id) as purchaseCount,
      CASE WHEN IFNULL(a.resolved_at, '') <> '' THEN 'RESOLVED' ELSE 'OPEN' END as status
    ${baseSql}
    ORDER BY issuedAt DESC, a.id DESC
    LIMIT ? OFFSET ?
  `).all(...vals, limit, offset) as any[]

  const totalRow = d.prepare(`
    SELECT COUNT(1) as c
    FROM (
      SELECT a.id
      ${baseSql}
    ) t
  `).get(...vals) as any

  return {
    rows: rows.map((row) => ({
      ...row,
      amount: toMoney(row.amount),
      settledAmount: toMoney(row.settledAmount),
      purchaseAmount: toMoney(row.purchaseAmount),
      openAmount: toMoney(row.openAmount)
    })),
    total: Number(totalRow?.c || 0)
  }
}

export function getAdvanceById(input: { id: number }) {
  const d = getDb()
  const row = d.prepare(`
    SELECT
      a.id,
      a.member_id as memberId,
      a.recipient_name as recipientName,
      a.issued_at as issuedAt,
      a.amount as amount,
      a.notes as notes,
      a.budget_id as budgetId,
      a.earmark_id as earmarkId,
      a.placeholder_voucher_id as placeholderVoucherId,
      a.resolved_at as resolvedAt,
      a.created_at as createdAt,
      IFNULL(m.name, a.recipient_name) as memberName,
      IFNULL(SUM(s.amount), 0) as settledAmount,
      COUNT(s.id) as settlementCount,
      CASE WHEN IFNULL(a.resolved_at, '') <> '' THEN 'RESOLVED' ELSE 'OPEN' END as status
    FROM member_advances a
    LEFT JOIN members m ON m.id = a.member_id
    LEFT JOIN member_advance_settlements s ON s.advance_id = a.id
    WHERE a.id = ?
    GROUP BY a.id
  `).get(input.id) as any

  if (!row) return null

  const purchases = d.prepare(`
    SELECT
      p.id,
      p.advance_id as advanceId,
      p.date,
      p.type,
      p.sphere,
      p.description,
      p.net_amount as netAmount,
      p.gross_amount as grossAmount,
      p.vat_rate as vatRate,
      p.payment_method as paymentMethod,
      p.category_id as categoryId,
      p.project_id as projectId,
      p.budgets_json as budgetsJson,
      p.earmarks_json as earmarksJson,
      p.tags_json as tagsJson,
      p.files_json as filesJson,
      p.voucher_id as voucherId,
      p.created_at as createdAt,
      v.voucher_no as voucherNo
    FROM member_advance_purchases p
    LEFT JOIN vouchers v ON v.id = p.voucher_id
    WHERE p.advance_id = ?
    ORDER BY p.date DESC, p.id DESC
  `).all(input.id) as any[]

  const purchaseAmount = purchases
    .filter((p) => p.voucherId == null)
    .reduce((sum, p) => {
      const gross = toMoney(p.grossAmount)
      const sign = p.type === 'IN' ? -1 : 1
      return sum + sign * gross
    }, 0)
  const openAmount = toMoney(toMoney(row.amount) - toMoney(purchaseAmount))

  const settlements = d.prepare(`
    SELECT
      s.id,
      s.advance_id as advanceId,
      s.settled_at as settledAt,
      s.amount,
      s.note,
      s.voucher_id as voucherId,
      s.invoice_id as invoiceId,
      s.created_at as createdAt,
      v.voucher_no as voucherNo,
      i.invoice_no as invoiceNo
    FROM member_advance_settlements s
    LEFT JOIN vouchers v ON v.id = s.voucher_id
    LEFT JOIN invoices i ON i.id = s.invoice_id
    WHERE s.advance_id = ?
    ORDER BY s.settled_at DESC, s.id DESC
  `).all(input.id) as any[]

  return {
    ...row,
    amount: toMoney(row.amount),
    settledAmount: toMoney(row.settledAmount),
    purchaseAmount: toMoney(purchaseAmount),
    openAmount,
    settlements: settlements.map((s) => ({
      ...s,
      amount: toMoney(s.amount)
    })),
    purchases: purchases.map((p) => ({
      ...p,
      netAmount: toMoney(p.netAmount),
      grossAmount: toMoney(p.grossAmount),
      vatRate: Number(p.vatRate || 0),
      budgets: safeJsonParse<any[]>(p.budgetsJson, []),
      earmarks: safeJsonParse<any[]>(p.earmarksJson, []),
      tags: safeJsonParse<string[]>(p.tagsJson, []),
      files: safeJsonParse<any[]>(p.filesJson, [])
    }))
  }
}

export function createAdvance(input: {
  recipientName: string
  issuedAt: string
  amount: number
  notes?: string | null
  budgetId?: number | null
  earmarkId?: number | null
}) {
  if (!input.recipientName?.trim()) throw new Error('Empfänger ist erforderlich')
  if (!input.issuedAt) throw new Error('Ausgabedatum ist erforderlich')
  if (input.amount == null || Number(input.amount) <= 0) throw new Error('Betrag muss positiv sein')

  return withTransaction((d: DB) => {
    const placeholder = createVoucher({
      date: input.issuedAt,
      type: 'OUT',
      sphere: 'VERMOEGEN',
      description: `Vorschuss: ${input.recipientName.trim()}`,
      grossAmount: toMoney(input.amount),
      vatRate: 0,
      paymentMethod: 'BAR'
    })

    const info = d.prepare(`
      INSERT INTO member_advances(
        member_id, recipient_name, issued_at, amount, notes, budget_id, earmark_id, placeholder_voucher_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      null,
      input.recipientName.trim(),
      input.issuedAt,
      toMoney(input.amount),
      input.notes ?? null,
      input.budgetId ?? null,
      input.earmarkId ?? null,
      placeholder?.id ?? null
    )
    return { id: Number(info.lastInsertRowid) }
  })
}

export function addAdvancePurchase(input: {
  advanceId: number
  date: string
  type: AdvancePurchaseType
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  description?: string | null
  netAmount?: number
  grossAmount?: number
  vatRate: number
  paymentMethod?: 'BAR' | 'BANK' | null
  categoryId?: number | null
  projectId?: number | null
  budgets?: Array<{ budgetId: number; amount: number }>
  earmarks?: Array<{ earmarkId: number; amount: number }>
  files?: { name: string; dataBase64: string; mime?: string }[]
  tags?: string[]
}) {
  if (!input.advanceId || input.advanceId <= 0) throw new Error('advanceId ist erforderlich')
  if (!input.date) throw new Error('Datum ist erforderlich')

  const d = getDb()
  const advance = d.prepare('SELECT id, resolved_at as resolvedAt FROM member_advances WHERE id = ?').get(input.advanceId) as any
  if (!advance) throw new Error('Vorschuss nicht gefunden')
  if (advance?.resolvedAt) throw new Error('Vorschuss ist bereits aufgelöst')

  const amountNet = typeof input.netAmount === 'number' ? toMoney(input.netAmount) : null
  const amountGross = typeof input.grossAmount === 'number' ? toMoney(input.grossAmount) : null
  if (amountNet == null && amountGross == null) throw new Error('Netto oder Brutto ist erforderlich')

  const vatRate = Number(input.vatRate || 0)
  const computedGross = amountGross != null ? amountGross : toMoney(amountNet! + toMoney((amountNet! * vatRate) / 100))
  const computedNet = amountNet != null ? amountNet : 0

  return withTransaction((tx: DB) => {
    const info = tx.prepare(`
      INSERT INTO member_advance_purchases(
        advance_id, date, type, sphere, description,
        net_amount, gross_amount, vat_rate, payment_method,
        category_id, project_id,
        budgets_json, earmarks_json, tags_json, files_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.advanceId,
      input.date,
      input.type,
      input.sphere,
      (input.description ?? null),
      computedNet,
      computedGross,
      vatRate,
      input.paymentMethod ?? null,
      input.categoryId ?? null,
      input.projectId ?? null,
      JSON.stringify(input.budgets ?? []),
      JSON.stringify(input.earmarks ?? []),
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.files ?? [])
    )
    return { id: Number(info.lastInsertRowid) }
  })
}

export function updateAdvancePurchase(input: {
  id: number
  date: string
  type: AdvancePurchaseType
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  description?: string | null
  netAmount?: number
  grossAmount?: number
  vatRate: number
  paymentMethod?: 'BAR' | 'BANK' | null
  categoryId?: number | null
  projectId?: number | null
  budgets?: Array<{ budgetId: number; amount: number }>
  earmarks?: Array<{ earmarkId: number; amount: number }>
  files?: { name: string; dataBase64: string; mime?: string }[]
  tags?: string[]
}) {
  if (!input.id || input.id <= 0) throw new Error('ID ist erforderlich')
  if (!input.date) throw new Error('Datum ist erforderlich')

  const d = getDb()
  const row = d.prepare(`
    SELECT p.id, p.voucher_id as voucherId, a.resolved_at as resolvedAt
    FROM member_advance_purchases p
    JOIN member_advances a ON a.id = p.advance_id
    WHERE p.id = ?
  `).get(input.id) as any
  if (!row) throw new Error('Buchung nicht gefunden')
  if (row.resolvedAt) throw new Error('Vorschuss ist bereits aufgelöst')
  if (row.voucherId) throw new Error('Buchung ist bereits gebucht')

  const amountNet = typeof input.netAmount === 'number' ? toMoney(input.netAmount) : null
  const amountGross = typeof input.grossAmount === 'number' ? toMoney(input.grossAmount) : null
  if (amountNet == null && amountGross == null) throw new Error('Netto oder Brutto ist erforderlich')

  const vatRate = Number(input.vatRate || 0)
  const computedGross = amountGross != null ? amountGross : toMoney(amountNet! + toMoney((amountNet! * vatRate) / 100))
  const computedNet = amountNet != null ? amountNet : 0

  return withTransaction((tx: DB) => {
    tx.prepare(`
      UPDATE member_advance_purchases SET
        date = ?, type = ?, sphere = ?, description = ?,
        net_amount = ?, gross_amount = ?, vat_rate = ?, payment_method = ?,
        category_id = ?, project_id = ?,
        budgets_json = ?, earmarks_json = ?, tags_json = ?, files_json = ?
      WHERE id = ?
    `).run(
      input.date,
      input.type,
      input.sphere,
      (input.description ?? null),
      computedNet,
      computedGross,
      vatRate,
      input.paymentMethod ?? null,
      input.categoryId ?? null,
      input.projectId ?? null,
      JSON.stringify(input.budgets ?? []),
      JSON.stringify(input.earmarks ?? []),
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.files ?? []),
      input.id
    )
    return { id: input.id }
  })
}

export function deleteAdvancePurchase(input: { id: number }) {
  return withTransaction((d: DB) => {
    const row = d.prepare(`
      SELECT p.id, p.voucher_id as voucherId, a.resolved_at as resolvedAt
      FROM member_advance_purchases p
      JOIN member_advances a ON a.id = p.advance_id
      WHERE p.id = ?
    `).get(input.id) as any
    if (!row) throw new Error('Buchung nicht gefunden')
    if (row.resolvedAt) throw new Error('Vorschuss ist bereits aufgelöst')
    if (row.voucherId) throw new Error('Buchung ist bereits gebucht')

    const res = d.prepare('DELETE FROM member_advance_purchases WHERE id = ?').run(input.id)
    if (!res.changes) throw new Error('Buchung nicht gefunden')
    return { id: input.id }
  })
}

export function resolveAdvance(input: { id: number }) {
  return withTransaction((d: DB) => {
    const advance = d.prepare(`
      SELECT id, recipient_name as recipientName, issued_at as issuedAt, amount, placeholder_voucher_id as placeholderVoucherId, resolved_at as resolvedAt
      FROM member_advances WHERE id = ?
    `).get(input.id) as any
    if (!advance) throw new Error('Vorschuss nicht gefunden')
    if (advance.resolvedAt) throw new Error('Vorschuss ist bereits aufgelöst')

    const purchases = d.prepare(`
      SELECT id, date, type, sphere, description, net_amount as netAmount, gross_amount as grossAmount, vat_rate as vatRate,
             payment_method as paymentMethod, category_id as categoryId, project_id as projectId,
             budgets_json as budgetsJson, earmarks_json as earmarksJson, tags_json as tagsJson, files_json as filesJson
      FROM member_advance_purchases
      WHERE advance_id = ? AND voucher_id IS NULL
      ORDER BY date ASC, id ASC
    `).all(input.id) as any[]

    for (const p of purchases) {
      const budgets = safeJsonParse<Array<{ budgetId: number; amount: number }>>(p.budgetsJson, [])
      const earmarks = safeJsonParse<Array<{ earmarkId: number; amount: number }>>(p.earmarksJson, [])
      const tags = safeJsonParse<string[]>(p.tagsJson, [])
      const files = safeJsonParse<Array<{ name: string; dataBase64: string; mime?: string }>>(p.filesJson, [])

      const res = createVoucher({
        date: p.date,
        type: p.type,
        sphere: p.sphere,
        description: (p.description ?? '').trim() || `Vorschuss: ${advance.recipientName}`,
        // Preserve entry mode: if net is present/non-zero, prefer net; otherwise gross
        netAmount: typeof p.netAmount === 'number' && Number(p.netAmount) > 0 ? Number(p.netAmount) : undefined,
        grossAmount: typeof p.netAmount === 'number' && Number(p.netAmount) > 0 ? undefined : Number(p.grossAmount || 0),
        vatRate: Number(p.vatRate || 0),
        paymentMethod: p.paymentMethod ?? undefined,
        categoryId: p.categoryId ?? undefined,
        projectId: p.projectId ?? undefined,
        budgets: budgets.length ? budgets : undefined,
        earmarks: earmarks.length ? earmarks : undefined,
        tags: tags.length ? tags : undefined,
        files: files.length ? files : undefined
      } as any)

      d.prepare('UPDATE member_advance_purchases SET voucher_id = ? WHERE id = ?').run(res.id, p.id)
    }

    if (advance.placeholderVoucherId) {
      deleteVoucher(Number(advance.placeholderVoucherId), { allowAdvancePlaceholder: true })
    }

    d.prepare("UPDATE member_advances SET resolved_at = datetime('now') WHERE id = ?").run(input.id)
    return { id: input.id }
  })
}

export function settleAdvance(input: {
  id: number
  settledAt: string
  amount: number
  note?: string | null
  voucherId?: number | null
  invoiceId?: number | null
}) {
  if (!input.settledAt) throw new Error('Auflösungsdatum ist erforderlich')
  if (input.amount == null || Number(input.amount) <= 0) throw new Error('Betrag muss positiv sein')

  return withTransaction((d: DB) => {
    const advance = d.prepare(`
      SELECT
        a.id,
        a.amount,
        (a.amount - IFNULL((SELECT SUM(s.amount) FROM member_advance_settlements s WHERE s.advance_id = a.id), 0)) as openAmount
      FROM member_advances a
      WHERE a.id = ?
    `).get(input.id) as { id: number; amount: number; openAmount: number } | undefined

    if (!advance) throw new Error('Vorschuss nicht gefunden')

    const amount = toMoney(input.amount)
    const openAmount = toMoney(advance.openAmount)
    if (amount - openAmount > 0.009) {
      throw new Error(`Auflösungsbetrag überschreitet offenen Betrag (${openAmount.toFixed(2)} €)`) 
    }

    const info = d.prepare(`
      INSERT INTO member_advance_settlements(
        advance_id, settled_at, amount, note, voucher_id, invoice_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.settledAt,
      amount,
      input.note ?? null,
      input.voucherId ?? null,
      input.invoiceId ?? null
    )

    return { id: Number(info.lastInsertRowid) }
  })
}

export function deleteAdvance(input: { id: number }) {
  return withTransaction((d: DB) => {
    const adv = d.prepare('SELECT id, placeholder_voucher_id as placeholderVoucherId, resolved_at as resolvedAt FROM member_advances WHERE id = ?').get(input.id) as any
    if (!adv) throw new Error('Vorschuss nicht gefunden')
    if (adv.resolvedAt) throw new Error('Aufgelöste Vorschüsse können nicht gelöscht werden')

    const pcount = d.prepare('SELECT COUNT(1) as c FROM member_advance_purchases WHERE advance_id = ?').get(input.id) as any
    if (Number(pcount?.c || 0) > 0) throw new Error('Vorschuss mit Buchungen kann nicht gelöscht werden')

    const used = d.prepare('SELECT COUNT(1) as c FROM member_advance_settlements WHERE advance_id = ?').get(input.id) as any
    if (Number(used?.c || 0) > 0) throw new Error('Vorschuss mit Auflösungen kann nicht gelöscht werden')

    const res = d.prepare('DELETE FROM member_advances WHERE id = ?').run(input.id)
    if (!res.changes) throw new Error('Vorschuss nicht gefunden')

    if (adv.placeholderVoucherId) {
      try { deleteVoucher(Number(adv.placeholderVoucherId), { allowAdvancePlaceholder: true }) } catch { }
    }
    return { id: input.id }
  })
}
