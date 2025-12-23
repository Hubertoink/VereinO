import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { getAppDataDir, getDb, withTransaction } from '../db/database'
import { createVoucher } from './vouchers'
import { setVoucherTags } from './tags'

 type DB = InstanceType<typeof Database>

export type InvoiceStatus = 'OPEN' | 'PARTIAL' | 'PAID'

function clamp2(n: number) { return Math.round(n * 100) / 100 }

function computeStatus(gross: number, paid: number): InvoiceStatus {
  if (paid <= 0) return 'OPEN'
  if (paid + 1e-6 < gross) return 'PARTIAL'
  return 'PAID'
}

function setInvoiceTags(d: DB, invoiceId: number, tags?: string[]) {
  if (!tags || !tags.length) return
  const tRows = (tags || []).map(t => String(t).trim()).filter(Boolean)
  // ensure tags exist
  for (const name of tRows) {
    try { d.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(name) } catch {}
    const t = d.prepare('SELECT id FROM tags WHERE name=?').get(name) as any
    if (t) d.prepare('INSERT OR IGNORE INTO invoice_tags(invoice_id, tag_id) VALUES (?,?)').run(invoiceId, t.id)
  }
}

export function createInvoice(input: {
  date: string
  dueDate?: string | null
  invoiceNo?: string | null
  party: string
  description?: string | null
  grossAmount: number
  paymentMethod?: string | null
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  earmarkId?: number | null
  budgetId?: number | null
  autoPost?: boolean
  voucherType: 'IN' | 'OUT'
  files?: { name: string; dataBase64: string; mime?: string }[]
  tags?: string[]
}) {
  return withTransaction((d: DB) => {
    const info = d.prepare(`INSERT INTO invoices(date, due_date, invoice_no, party, description, gross_amount, payment_method, sphere, earmark_id, budget_id, auto_post, voucher_type)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        input.date,
        input.dueDate ?? null,
        input.invoiceNo ?? null,
        input.party,
        input.description ?? null,
        clamp2(input.grossAmount),
        input.paymentMethod ?? null,
        input.sphere,
        input.earmarkId ?? null,
        input.budgetId ?? null,
        input.autoPost === false ? 0 : 1,
        input.voucherType
      )
    const id = Number(info.lastInsertRowid)

    // files
    if (input.files?.length) {
      const { filesDir } = getAppDataDir()
      for (const f of input.files) {
        const buff = Buffer.from(f.dataBase64, 'base64')
        const safe = `${id}-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
        const abs = path.join(filesDir, safe)
        fs.writeFileSync(abs, buff)
        d.prepare('INSERT INTO invoice_files(invoice_id, file_name, file_path, mime_type, size) VALUES (?,?,?,?,?)').run(id, f.name, abs, f.mime ?? null, buff.length)
      }
    }
    setInvoiceTags(d, id, input.tags)
    return { id }
  })
}

export function updateInvoice(input: {
  id: number
  date?: string
  dueDate?: string | null
  invoiceNo?: string | null
  party?: string
  description?: string | null
  grossAmount?: number
  paymentMethod?: string | null
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  earmarkId?: number | null
  budgetId?: number | null
  autoPost?: boolean
  voucherType?: 'IN' | 'OUT'
  tags?: string[]
}) {
  return withTransaction((d: DB) => {
    const cur = d.prepare('SELECT * FROM invoices WHERE id=?').get(input.id)
    if (!cur) throw new Error('Rechnung nicht gefunden')
    d.prepare(`UPDATE invoices SET
      date=COALESCE(?, date),
      due_date=COALESCE(?, due_date),
      invoice_no=COALESCE(?, invoice_no),
      party=COALESCE(?, party),
      description=COALESCE(?, description),
      gross_amount=COALESCE(?, gross_amount),
      payment_method=COALESCE(?, payment_method),
      sphere=COALESCE(?, sphere),
      earmark_id=COALESCE(?, earmark_id),
      budget_id=COALESCE(?, budget_id),
      auto_post=COALESCE(?, auto_post),
      voucher_type=COALESCE(?, voucher_type),
      updated_at=datetime('now')
      WHERE id=?`).run(
      input.date ?? null,
      input.dueDate ?? null,
      input.invoiceNo ?? null,
      input.party ?? null,
      input.description ?? null,
      input.grossAmount != null ? clamp2(input.grossAmount) : null,
      input.paymentMethod ?? null,
      input.sphere ?? null,
      input.earmarkId ?? null,
      input.budgetId ?? null,
      input.autoPost == null ? null : (input.autoPost ? 1 : 0),
      input.voucherType ?? null,
      input.id
    )
    if (input.tags) {
      d.prepare('DELETE FROM invoice_tags WHERE invoice_id=?').run(input.id)
      setInvoiceTags(d, input.id, input.tags)
    }
    return { id: input.id }
  })
}

export function deleteInvoice(id: number) {
  const d = getDb()
  d.prepare('DELETE FROM invoices WHERE id=?').run(id)
  return { id }
}

export function listInvoicesPaged(filters: {
  limit?: number
  offset?: number
  sort?: 'ASC' | 'DESC'
  sortBy?: 'date' | 'due'
  status?: InvoiceStatus | 'ALL'
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  budgetId?: number
  q?: string
  dueFrom?: string
  dueTo?: string
  tag?: string
}): { rows: any[]; total: number } {
  const d = getDb()
  const { limit = 20, offset = 0, status, sphere, budgetId, q, dueFrom, dueTo, tag } = filters
  const sort = (filters.sort === 'ASC' || filters.sort === 'DESC') ? filters.sort : undefined
  const sortBy = (filters.sortBy === 'date' || filters.sortBy === 'due' || filters.sortBy === 'amount' || filters.sortBy === 'status') ? filters.sortBy : undefined
  const params: any[] = []
  const wh: string[] = []
  let joinTag = ''
  if (sphere) { wh.push('i.sphere = ?'); params.push(sphere) }
  if (budgetId) { wh.push('i.budget_id = ?'); params.push(budgetId) }
  if (dueFrom) { wh.push('i.due_date >= ?'); params.push(dueFrom) }
  if (dueTo) { wh.push('i.due_date <= ?'); params.push(dueTo) }
  if (q && q.trim()) {
    const like = `%${q.trim()}%`
    wh.push('(i.invoice_no LIKE ? OR i.party LIKE ? OR i.description LIKE ? OR i.date LIKE ? OR i.due_date LIKE ?)')
    params.push(like, like, like, like, like)
  }
  if (tag) { joinTag = 'JOIN invoice_tags it ON it.invoice_id = i.id JOIN tags t ON t.id = it.tag_id'; wh.push('t.name = ?'); params.push(tag) }
  const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
  const base = `FROM invoices i ${joinTag} ${whereSql}`
  const total = (d.prepare(`SELECT COUNT(DISTINCT i.id) as c ${base}`).get(...params) as any)?.c || 0

  const orderExpr = (sortBy === 'date')
    ? 'i.date'
    : (sortBy === 'amount')
      ? 'i.gross_amount'
      : (sortBy === 'status')
        ? "CASE WHEN IFNULL((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) >= i.gross_amount THEN 2 WHEN IFNULL((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) > 0 THEN 1 ELSE 0 END"
        : 'COALESCE(i.due_date, i.date)'
  const orderDir = sort ?? 'ASC'

  const rows = d.prepare(`
    SELECT i.id, i.date, i.due_date as dueDate, i.invoice_no as invoiceNo, i.party, i.description,
           i.gross_amount as grossAmount, i.payment_method as paymentMethod, i.sphere,
           i.earmark_id as earmarkId, i.budget_id as budgetId, i.auto_post as autoPost,
           i.voucher_type as voucherType, i.posted_voucher_id as postedVoucherId,
           (SELECT v.voucher_no FROM vouchers v WHERE v.id = i.posted_voucher_id) as postedVoucherNo,
           (SELECT COUNT(1) FROM invoice_files f WHERE f.invoice_id = i.id) as fileCount,
           IFNULL((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) as paidSum,
           (
             SELECT GROUP_CONCAT(t2.name, '\u0001')
             FROM invoice_tags it2 JOIN tags t2 ON t2.id = it2.tag_id
             WHERE it2.invoice_id = i.id
           ) as tagsConcat
    ${base}
    GROUP BY i.id
    ORDER BY ${orderExpr} ${orderDir}, i.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[]

  const mapped = rows.map(r => {
    const status2 = computeStatus(Number(r.grossAmount || 0), Number(r.paidSum || 0))
    return { ...r, status: status2 as InvoiceStatus, tags: r.tagsConcat ? String(r.tagsConcat).split('\u0001') : [] }
  })

  const filtered = (status && status !== 'ALL') ? mapped.filter(r => r.status === status) : mapped
  
  // Recalculate total after status filter by counting all matching rows (not just the limited result)
  let actualTotal = total
  if (status && status !== 'ALL') {
    // We need to count all rows with this status, not just the limited result
    // Fetch all rows without limit to count them properly
    const allRowsForCount = d.prepare(`
      SELECT 
        i.id,
        i.gross_amount as grossAmount,
        IFNULL((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) as paidSum
      ${base}
      GROUP BY i.id
    `).all(...params) as any[]
    
    const allMapped = allRowsForCount.map(r => {
      const status2 = computeStatus(Number(r.grossAmount || 0), Number(r.paidSum || 0))
      return { ...r, status: status2 as InvoiceStatus }
    })
    actualTotal = allMapped.filter(r => r.status === status).length
  }
  
  return { rows: filtered, total: actualTotal }
}

export function summarizeInvoices(filters: {
  status?: InvoiceStatus | 'ALL'
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  budgetId?: number
  q?: string
  dueFrom?: string
  dueTo?: string
  tag?: string
}): { count: number; gross: number; paid: number; remaining: number; grossIn: number; grossOut: number } {
  const d = getDb()
  const { status, sphere, budgetId, q, dueFrom, dueTo, tag } = filters || {}
  const params: any[] = []
  const wh: string[] = []
  let joinTag = ''
  if (sphere) { wh.push('i.sphere = ?'); params.push(sphere) }
  if (budgetId) { wh.push('i.budget_id = ?'); params.push(budgetId) }
  if (dueFrom) { wh.push('i.due_date >= ?'); params.push(dueFrom) }
  if (dueTo) { wh.push('i.due_date <= ?'); params.push(dueTo) }
  if (q && q.trim()) {
    const like = `%${q.trim()}%`
    wh.push('(i.invoice_no LIKE ? OR i.party LIKE ? OR i.description LIKE ? OR i.date LIKE ? OR i.due_date LIKE ?)')
    params.push(like, like, like, like, like)
  }
  if (tag) { joinTag = 'JOIN invoice_tags it ON it.invoice_id = i.id JOIN tags t ON t.id = it.tag_id'; wh.push('t.name = ?'); params.push(tag) }
  const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
  const base = `FROM invoices i ${joinTag} ${whereSql}`
  // Compute gross and paid per invoice, then aggregate with optional status filter
  const rows = d.prepare(`
    SELECT i.id,
           i.gross_amount as grossAmount,
           i.voucher_type as voucherType,
           IFNULL((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) as paidSum
    ${base}
    GROUP BY i.id
  `).all(...params) as any[]
  const mapped = rows.map(r => ({ gross: Number(r.grossAmount || 0), paid: Number(r.paidSum || 0), voucherType: r.voucherType }))
  const withStatus = mapped.map(r => ({ ...r, status: computeStatus(r.gross, r.paid) }))
  const filtered = (status && status !== 'ALL') ? withStatus.filter(r => r.status === status) : withStatus
  const agg = filtered.reduce((acc, r) => {
    acc.count += 1
    acc.gross += r.gross
    acc.paid += r.paid
    if (r.voucherType === 'IN') {
      acc.grossIn += r.gross
    } else if (r.voucherType === 'OUT') {
      acc.grossOut += r.gross
    }
    return acc
  }, { count: 0, gross: 0, paid: 0, grossIn: 0, grossOut: 0 })
  const remaining = clamp2(Math.max(0, Math.round((agg.gross - agg.paid) * 100) / 100))
  return { count: agg.count, gross: clamp2(agg.gross), paid: clamp2(agg.paid), remaining, grossIn: clamp2(agg.grossIn), grossOut: clamp2(agg.grossOut) }
}

export function getInvoiceById(id: number) {
  const d = getDb()
  const r = d.prepare(`SELECT i.id, i.date, i.due_date as dueDate, i.invoice_no as invoiceNo, i.party, i.description,
           i.gross_amount as grossAmount, i.payment_method as paymentMethod, i.sphere,
           i.earmark_id as earmarkId, i.budget_id as budgetId, i.auto_post as autoPost,
           i.voucher_type as voucherType, i.posted_voucher_id as postedVoucherId,
           (SELECT v.voucher_no FROM vouchers v WHERE v.id = i.posted_voucher_id) as postedVoucherNo
         FROM invoices i WHERE i.id=?`).get(id) as any
  if (!r) throw new Error('Rechnung nicht gefunden')
  const payments = d.prepare('SELECT id, date, amount FROM invoice_payments WHERE invoice_id = ? ORDER BY date ASC, id ASC').all(id) as any[]
  const files = d.prepare('SELECT id, file_name as fileName, mime_type as mimeType, size, created_at as createdAt FROM invoice_files WHERE invoice_id = ? ORDER BY created_at DESC').all(id) as any[]
  const tags = (d.prepare(`SELECT t.name FROM invoice_tags it JOIN tags t ON t.id = it.tag_id WHERE it.invoice_id = ? ORDER BY t.name`).all(id) as any[]).map((x: any) => x.name)
  const paidSum = (d.prepare('SELECT IFNULL(SUM(amount),0) as s FROM invoice_payments WHERE invoice_id = ?').get(id) as any)?.s || 0
  const status: InvoiceStatus = computeStatus(Number(r.grossAmount || 0), Number(paidSum))
  return { ...r, payments, files, tags, paidSum, status }
}

export function getInvoiceFileById(fileId: number) {
  const d = getDb()
  const row = d.prepare(`
        SELECT id, invoice_id as invoiceId, file_name as fileName, file_path as filePath, mime_type as mimeType, size, created_at as createdAt
        FROM invoice_files WHERE id = ?
    `).get(fileId) as any
  return row
}

// List files for a given invoice (used by edit modal)
export function listFilesForInvoice(invoiceId: number) {
  const d = getDb()
  const rows = d.prepare(`
        SELECT id, file_name as fileName, file_path as filePath, mime_type as mimeType, size, created_at as createdAt
        FROM invoice_files WHERE invoice_id = ? ORDER BY created_at DESC, id DESC
    `).all(invoiceId) as any[]
  return rows
}

// Add a new file to an existing invoice
export function addFileToInvoice(invoiceId: number, fileName: string, dataBase64: string, mime?: string) {
  const d = getDb()
  const { filesDir } = getAppDataDir()
  const buff = Buffer.from(dataBase64, 'base64')
  const safeName = `${invoiceId}-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
  const abs = path.join(filesDir, safeName)
  fs.writeFileSync(abs, buff)
  const info = d.prepare('INSERT INTO invoice_files(invoice_id, file_name, file_path, mime_type, size) VALUES (?,?,?,?,?)').run(invoiceId, fileName, abs, mime ?? null, buff.length)
  const id = Number(info.lastInsertRowid)
  return { id }
}

// Delete an invoice file and remove from disk
export function deleteInvoiceFile(fileId: number) {
  const d = getDb()
  const row = d.prepare('SELECT file_path as filePath FROM invoice_files WHERE id=?').get(fileId) as any
  d.prepare('DELETE FROM invoice_files WHERE id=?').run(fileId)
  try { if (row?.filePath && fs.existsSync(row.filePath)) fs.unlinkSync(row.filePath) } catch { /* ignore */ }
  return { id: fileId }
}

export function addPayment(input: { invoiceId: number; date: string; amount: number }) {
  return withTransaction((d: DB) => {
    const inv = d.prepare('SELECT * FROM invoices WHERE id=?').get(input.invoiceId) as any
    if (!inv) throw new Error('Rechnung nicht gefunden')
    const gross = Number(inv.gross_amount || 0)
    const paidRow0 = d.prepare('SELECT IFNULL(SUM(amount),0) as s FROM invoice_payments WHERE invoice_id = ?').get(input.invoiceId) as any
    const paid0 = Number(paidRow0?.s || 0)
    const remainingBefore = clamp2(Math.max(0, gross - paid0))
    const addAmt = clamp2(Number(input.amount || 0))
    if (addAmt <= 0) throw new Error('Zahlungsbetrag muss positiv sein')
    if (addAmt - remainingBefore > 1e-6) {
      throw new Error(`Zahlung überschreitet den offenen Rest (${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(remainingBefore)}).`)
    }
    d.prepare('INSERT INTO invoice_payments(invoice_id, date, amount) VALUES (?,?,?)').run(input.invoiceId, input.date, addAmt)
    // After adding, check status and auto-post
    const paidRow = d.prepare('SELECT IFNULL(SUM(amount),0) as s FROM invoice_payments WHERE invoice_id = ?').get(input.invoiceId) as any
    const paid = Number(paidRow?.s || 0)
    const status = computeStatus(gross, paid)
    let voucherId: number | null = null
    if (status === 'PAID' && inv.auto_post && !inv.posted_voucher_id) {
      // voucher creation on final payment
      const vDate = input.date
      const desc = (inv.description && String(inv.description).trim())
        ? String(inv.description).trim()
        : `Zahlung zu Rechnung ${inv.invoice_no ?? '#' + input.invoiceId}`
      const res = createVoucher({
        date: vDate,
        type: inv.voucher_type,
        sphere: inv.sphere,
        description: desc,
        grossAmount: clamp2(paid),
        vatRate: 0,
        paymentMethod: inv.payment_method ?? null,
        earmarkId: inv.earmark_id ?? null,
        budgetId: inv.budget_id ?? null,
        tags: (d.prepare(`SELECT t.name FROM invoice_tags it JOIN tags t ON t.id = it.tag_id WHERE it.invoice_id = ?`).all(input.invoiceId) as any[]).map(x => x.name)
      } as any)
      voucherId = res.id
      d.prepare('UPDATE invoices SET posted_voucher_id = ? WHERE id=?').run(voucherId, input.invoiceId)
    }
    return { id: input.invoiceId, status, paidSum: paid, voucherId }
  })
}

export function markPaid(invoiceId: number) {
  return withTransaction((d: DB) => {
    const inv = d.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId) as any
    if (!inv) throw new Error('Rechnung nicht gefunden')
    const paidRow = d.prepare('SELECT IFNULL(SUM(amount),0) as s FROM invoice_payments WHERE invoice_id = ?').get(invoiceId) as any
    const paid = Number(paidRow?.s || 0)
    const gross = Number(inv.gross_amount || 0)
    const remaining = clamp2(Math.max(0, gross - paid))
    if (remaining > 0) {
      const today = new Date().toISOString().slice(0,10)
      d.prepare('INSERT INTO invoice_payments(invoice_id, date, amount) VALUES (?,?,?)').run(invoiceId, today, remaining)
    }
    // Now trigger voucher if needed
    const total = clamp2(gross)
    let voucherId: number | null = inv.posted_voucher_id || null
    if (inv.auto_post && !inv.posted_voucher_id) {
      const desc = (inv.description && String(inv.description).trim())
        ? String(inv.description).trim()
        : `Zahlung zu Rechnung ${inv.invoice_no ?? '#' + invoiceId}`
      const res = createVoucher({
        date: new Date().toISOString().slice(0,10),
        type: inv.voucher_type,
        sphere: inv.sphere,
        description: desc,
        grossAmount: total,
        vatRate: 0,
        paymentMethod: inv.payment_method ?? null,
        earmarkId: inv.earmark_id ?? null,
        budgetId: inv.budget_id ?? null,
        tags: (d.prepare(`SELECT t.name FROM invoice_tags it JOIN tags t ON t.id = it.tag_id WHERE it.invoice_id = ?`).all(invoiceId) as any[]).map(x => x.name)
      } as any)
      voucherId = res.id
      d.prepare('UPDATE invoices SET posted_voucher_id = ? WHERE id=?').run(voucherId, invoiceId)
    }
    return { id: invoiceId, status: 'PAID' as InvoiceStatus, voucherId }
  })
}

// Manual post invoice to voucher (for PAID invoices without auto-post)
export function postInvoiceToVoucher(invoiceId: number) {
  return withTransaction((d: DB) => {
    const inv = d.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId) as any
    if (!inv) throw new Error('Rechnung nicht gefunden')
    if (inv.posted_voucher_id) throw new Error('Rechnung wurde bereits als Buchung hinzugefügt')
    
    const paidRow = d.prepare('SELECT IFNULL(SUM(amount),0) as s FROM invoice_payments WHERE invoice_id = ?').get(invoiceId) as any
    const paid = Number(paidRow?.s || 0)
    const gross = Number(inv.gross_amount || 0)
    
    if (paid < gross) throw new Error('Rechnung ist noch nicht vollständig bezahlt')
    
    const vDate = new Date().toISOString().slice(0, 10)
    const desc = (inv.description && String(inv.description).trim())
      ? String(inv.description).trim()
      : `Zahlung zu Rechnung ${inv.invoice_no ?? '#' + invoiceId}`
    
    const res = createVoucher({
      date: vDate,
      type: inv.voucher_type,
      sphere: inv.sphere,
      description: desc,
      grossAmount: clamp2(paid),
      vatRate: 0,
      paymentMethod: inv.payment_method ?? null,
      earmarkId: inv.earmark_id ?? null,
      budgetId: inv.budget_id ?? null,
      tags: (d.prepare(`SELECT t.name FROM invoice_tags it JOIN tags t ON t.id = it.tag_id WHERE it.invoice_id = ?`).all(invoiceId) as any[]).map(x => x.name)
    } as any)
    
    const voucherId = res.id
    d.prepare('UPDATE invoices SET posted_voucher_id = ? WHERE id=?').run(voucherId, invoiceId)
    
    return { id: invoiceId, voucherId }
  })
}

