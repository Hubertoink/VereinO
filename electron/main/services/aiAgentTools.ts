import { z } from 'zod'
import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import ExcelJS from 'exceljs'
import { listBankTransactions, findBankTransactionMatches, getBankTransaction } from '../repositories/bankTransactions'
import { listBindings } from '../repositories/bindings'
import { listBudgets } from '../repositories/budgets'
import { listInvoicesPaged, summarizeInvoices } from '../repositories/invoices'
import { listMembers } from '../repositories/members'
import { listAiAgentAutoRules, listAiAgentMemory, upsertAiAgentAutoRule, upsertAiAgentMemory } from '../repositories/aiAgentKnowledge'
import * as mp from '../repositories/members_payments'
import { listPaymentAccounts } from '../repositories/paymentAccounts'
import { listTags } from '../repositories/tags'
import { cashBalance, listVouchersAdvanced, listVouchersAdvancedPaged, monthlyVouchers, summarizeVouchers } from '../repositories/vouchers'
import type { AiContext } from './ai'

export type AiAgentDraft = {
  kind: 'booking' | 'voucherUpdate' | 'voucherReverse' | 'voucherRebook' | 'memberCreate' | 'memberUpdate' | 'contributionPaymentLink' | 'tagChange' | 'budgetChange' | 'earmarkChange' | 'bankLink' | 'invoiceAction' | 'reportExport'
  title: string
  payload: unknown
  autoApproval?: {
    action: 'AUTO_PRESELECT' | 'AUTO_APPLY_SAFE'
    ruleIds: number[]
    ruleNames: string[]
  } | null
}

export type AiAgentToolResult = {
  ok: boolean
  data?: unknown
  draft?: AiAgentDraft
  drafts?: AiAgentDraft[]
  warning?: string
}

export type AiAgentTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  readOnly: boolean
  run: (args: unknown) => Promise<AiAgentToolResult> | AiAgentToolResult
}

function roundMoney(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100
}

function limitNumber(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, Math.floor(parsed)))
}

function toolParameters(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required
  }
}

function parseArgs<T>(schema: z.ZodType<T>, args: unknown) {
  return schema.parse(args || {})
}

const nullableString = { type: ['string', 'null'] }
const nullableNumber = { type: ['number', 'null'] }

function normalizeLookup(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function displayMemberValue(field: string, value: unknown) {
  if (value == null || value === '') return '-'
  if (field === 'contribution_amount') return `${roundMoney(value)} EUR`
  if (field === 'contribution_interval') {
    if (value === 'MONTHLY') return 'monatlich'
    if (value === 'QUARTERLY') return 'quartalsweise'
    if (value === 'YEARLY') return 'jährlich'
  }
  if (field === 'status') {
    if (value === 'ACTIVE') return 'Aktiv'
    if (value === 'NEW') return 'Neu'
    if (value === 'PAUSED') return 'Pausiert'
    if (value === 'LEFT') return 'Ausgetreten'
  }
  return String(value)
}

const memberUpdateFields = [
  'memberNo',
  'name',
  'email',
  'phone',
  'address',
  'status',
  'boardRole',
  'iban',
  'bic',
  'contribution_amount',
  'contribution_interval',
  'mandate_ref',
  'mandate_date',
  'join_date',
  'leave_date',
  'notes',
  'next_due_date'
]

const allowedMemberUpdateFields = new Set(memberUpdateFields)

function memberFieldLabel(field: string) {
  const labels: Record<string, string> = {
    memberNo: 'Mitgliedsnummer',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    address: 'Adresse',
    status: 'Status',
    boardRole: 'Rolle',
    iban: 'IBAN',
    bic: 'BIC',
    contribution_amount: 'Beitrag',
    contribution_interval: 'Intervall',
    mandate_ref: 'Mandatsreferenz',
    mandate_date: 'Mandatsdatum',
    join_date: 'Eintritt',
    leave_date: 'Austritt',
    notes: 'Notizen',
    next_due_date: 'Nächste Frist'
  }
  return labels[field] || field
}

function memberUpdateChangesFor(member: any, changes: Record<string, unknown>, idPrefix: string) {
  return Object.entries(changes)
    .filter(([field]) => allowedMemberUpdateFields.has(field))
    .map(([field, newValue], idx) => {
      const oldValue = member[field]
      return {
        id: `${idPrefix}-${member.id}-${field}-${idx}`,
        memberId: Number(member.id),
        memberName: member.name,
        field,
        label: memberFieldLabel(field),
        oldValue,
        newValue,
        oldDisplay: displayMemberValue(field, oldValue),
        newDisplay: displayMemberValue(field, newValue),
        selected: true
      }
    })
    .filter((change) => change.oldDisplay !== change.newDisplay)
}

function normalizeEmailPart(value: string) {
  return normalizeLookup(value)
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function emailFromMemberName(name: string, domain: string, pattern: 'first.last' | 'first_last' | 'firstlast' | 'full.name') {
  const parts = normalizeLookup(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return null
  const first = parts[0]
  const last = parts.length > 1 ? parts.slice(1).join(pattern === 'first_last' ? '_' : pattern === 'firstlast' ? '' : '.') : ''
  const local = pattern === 'first.last'
    ? [first, last].filter(Boolean).join('.')
    : pattern === 'first_last'
      ? [first, last].filter(Boolean).join('_')
      : pattern === 'firstlast'
        ? [first, last].filter(Boolean).join('')
        : normalizeEmailPart(name)
  const cleanedDomain = String(domain || '').trim().replace(/^@+/, '').toLowerCase()
  if (!local || !cleanedDomain) return null
  return `${local}@${cleanedDomain}`
}

function budgetLabel(row: any) {
  return row?.categoryName || row?.projectName || row?.name || (row?.id ? `Budget #${row.id}` : 'Budget')
}

function budgetDisplay(row: any) {
  if (!row) return 'nicht vorhanden'
  return [
    budgetLabel(row),
    row.year,
    row.sphere,
    `${roundMoney(row.amountPlanned)} EUR`,
    row.isArchived ? 'archiviert' : null
  ].filter(Boolean).join(' · ')
}

function budgetPayloadDisplay(payload: any) {
  return [
    payload.categoryName || payload.projectName || payload.name || (payload.id ? `Budget #${payload.id}` : 'Budget'),
    payload.year,
    payload.sphere,
    `${roundMoney(payload.amountPlanned)} EUR`,
    payload.isArchived ? 'archivieren' : null
  ].filter(Boolean).join(' · ')
}

function earmarkLabel(row: any) {
  return row?.code && row?.name ? `${row.code} · ${row.name}` : row?.name || row?.code || (row?.id ? `Zweckbindung #${row.id}` : 'Zweckbindung')
}

function earmarkDisplay(row: any) {
  if (!row) return 'nicht vorhanden'
  return [
    earmarkLabel(row),
    row.budget != null ? `${roundMoney(row.budget)} EUR` : null,
    row.isActive === 0 ? 'inaktiv' : 'aktiv'
  ].filter(Boolean).join(' · ')
}

function earmarkPayloadDisplay(payload: any) {
  return [
    payload.code && payload.name ? `${payload.code} · ${payload.name}` : payload.name || payload.code,
    payload.budget != null ? `${roundMoney(payload.budget)} EUR` : null,
    payload.isActive === false ? 'inaktiv' : 'aktiv'
  ].filter(Boolean).join(' · ')
}

function makeEarmarkCode(name: string) {
  const normalized = normalizeLookup(name).replace(/\s+/g, '-').toUpperCase()
  return normalized.slice(0, 18) || 'ZWECK'
}

type AgentReportExportInput = {
  type: 'JOURNAL' | 'SPHERE_SUMMARY' | 'BUDGET_VS_ACTUAL' | 'EARMARK_USAGE'
  format: 'PDF' | 'CSV' | 'XLSX'
  from: string
  to: string
  filters?: Record<string, any>
  fields?: string[]
  amountMode?: 'POSITIVE_BOTH' | 'OUT_NEGATIVE'
  sort?: 'ASC' | 'DESC'
  sortBy?: 'date' | 'gross' | 'net' | 'attachments' | 'budget' | 'earmark' | 'payment' | 'sphere'
  title?: string | null
  includeKpis?: boolean | null
  includeCharts?: boolean | null
  includeVoucherList?: boolean | null
}

type AgentContentPdfExportInput = {
  title: string
  body: string
  fileName?: string | null
}

const reportFieldLabels: Record<string, string> = {
  date: 'Datum',
  voucherNo: 'Nr.',
  type: 'Typ',
  sphere: 'Sphäre',
  description: 'Beschreibung',
  status: 'Status',
  paymentMethod: 'Zahlweg',
  netAmount: 'Netto',
  vatAmount: 'MwSt',
  grossAmount: 'Brutto',
  tags: 'Tags'
}

async function ensureReportExportDir() {
  const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  await fs.mkdir(baseDir, { recursive: true })
  return baseDir
}

function reportStamp() {
  const when = new Date()
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char])
}

function safeFilePart(value: unknown, fallback: string) {
  const cleaned = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}

function isMarkdownTableLine(line: string) {
  return /^\s*\|?.+\|.+\|?\s*$/.test(line)
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)
}

function splitMarkdownTableRow(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function renderInlineContent(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderAgentContentHtml(markdown: string) {
  const lines = String(markdown || '').split(/\r?\n/)
  const blocks: string[] = []
  let idx = 0
  while (idx < lines.length) {
    const line = lines[idx].trim()
    if (!line) {
      idx += 1
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/) || line.match(/^\*\*([^*]+)\*\*$/)
    if (heading) {
      const content = heading[2] || heading[1]
      blocks.push(`<h2>${renderInlineContent(content)}</h2>`)
      idx += 1
      continue
    }
    if (isMarkdownTableLine(line) && idx + 1 < lines.length && isMarkdownTableSeparator(lines[idx + 1])) {
      const headers = splitMarkdownTableRow(line)
      idx += 2
      const rows: string[][] = []
      while (idx < lines.length && isMarkdownTableLine(lines[idx]) && !isMarkdownTableSeparator(lines[idx])) {
        const row = splitMarkdownTableRow(lines[idx])
        rows.push(headers.map((_, cellIdx) => row[cellIdx] || ''))
        idx += 1
      }
      blocks.push(`<table><thead><tr>${headers.map((header) => `<th>${renderInlineContent(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineContent(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (idx < lines.length && /^[-*]\s+/.test(lines[idx].trim())) {
        items.push(lines[idx].trim().replace(/^[-*]\s+/, ''))
        idx += 1
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineContent(item)}</li>`).join('')}</ul>`)
      continue
    }
    const paragraph: string[] = []
    while (
      idx < lines.length
      && lines[idx].trim()
      && !/^(#{1,3})\s+/.test(lines[idx].trim())
      && !/^\*\*[^*]+\*\*$/.test(lines[idx].trim())
      && !(isMarkdownTableLine(lines[idx].trim()) && idx + 1 < lines.length && isMarkdownTableSeparator(lines[idx + 1]))
      && !/^[-*]\s+/.test(lines[idx].trim())
    ) {
      paragraph.push(lines[idx].trim())
      idx += 1
    }
    blocks.push(`<p>${renderInlineContent(paragraph.join(' '))}</p>`)
  }
  return blocks.join('\n') || '<p>Keine Inhalte.</p>'
}

async function exportAgentContentPdf(args: AgentContentPdfExportInput) {
  const dir = await ensureReportExportDir()
  const filePath = path.join(dir, `${safeFilePart(args.fileName || args.title, 'VereinO-Agent-PDF')}_${reportStamp()}.pdf`)
  const title = args.title || 'VereinO Agent PDF'
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;margin:30px;color:#20231f;line-height:1.45}
h1{margin:0 0 6px;font-size:26px}h2{font-size:17px;margin:20px 0 8px}.muted{color:#697064;font-size:12px;margin-bottom:18px}
p{margin:0 0 12px}ul{margin:0 0 14px 22px;padding:0}li{margin:4px 0}code{background:#eef2ea;border-radius:4px;padding:1px 4px}
table{width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:12px;break-inside:auto}tr{break-inside:avoid}th,td{border-bottom:1px solid #e0e5dc;padding:7px 8px;text-align:left;vertical-align:top}th{background:#edf3e6;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#364030}tbody tr:nth-child(even){background:#f7f8f4}
.footer{margin-top:22px;color:#777f72;font-size:11px}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="muted">Erstellt durch VereinO Agent · ${new Date().toLocaleString('de-DE')}</div>
${renderAgentContentHtml(args.body)}
<div class="footer">VereinO Export · ${escapeHtml(filePath)}</div>
</body></html>`

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    await fs.writeFile(filePath, pdf)
  } finally {
    win.destroy()
  }
  return { filePath }
}

function reportRows(args: AgentReportExportInput) {
  return listVouchersAdvanced({
    limit: 100000,
    paymentMethod: args.filters?.paymentMethod || undefined,
    paymentAccountId: args.filters?.paymentAccountId ?? undefined,
    sphere: args.filters?.sphere || undefined,
    type: args.filters?.type || undefined,
    from: args.from,
    to: args.to,
    earmarkId: args.filters?.earmarkId,
    budgetId: args.filters?.budgetId,
    q: args.filters?.q,
    tag: args.filters?.tag,
    sort: args.sort || 'ASC',
    sortBy: args.sortBy || 'date'
  } as any)
}

function reportCell(row: any, field: string, outNegative: boolean) {
  if (field === 'paymentMethod') return row.paymentAccountName || row.paymentMethod || ''
  if (field === 'tags') return (row.tags || []).join(', ')
  if (field === 'grossAmount' || field === 'netAmount' || field === 'vatAmount') {
    const value = Number(row[field] || 0)
    const signed = outNegative && row.type === 'OUT' ? -Math.abs(value) : value
    return roundMoney(signed)
  }
  return row[field] ?? ''
}

function csvValue(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function reportSummaryData(args: AgentReportExportInput) {
  const filters = {
    from: args.from,
    to: args.to,
    paymentMethod: args.filters?.paymentMethod || undefined,
    paymentAccountId: args.filters?.paymentAccountId ?? undefined,
    sphere: args.filters?.sphere || undefined,
    type: args.filters?.type || undefined,
    earmarkId: args.filters?.earmarkId,
    budgetId: args.filters?.budgetId
  } as any
  const summary = summarizeVouchers(filters)
  const monthly = monthlyVouchers(filters)
  const cash = cashBalance({ to: args.to, sphere: filters.sphere, budgetId: filters.budgetId, paymentAccountId: filters.paymentAccountId } as any)
  const income = Number(summary.byType?.find((row: any) => row.key === 'IN')?.gross || 0)
  const expenses = Math.abs(Number(summary.byType?.find((row: any) => row.key === 'OUT')?.gross || 0))
  return {
    summary,
    monthly,
    cash,
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    saldo: roundMoney(income - expenses)
  }
}

async function exportAgentReportPdf(args: AgentReportExportInput, rows: any[], filePath: string) {
  const data = reportSummaryData(args)
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char])
  const euro = (value: unknown) => `${roundMoney(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  const topRows = rows.slice(0, 80)
  const includeKpis = args.includeKpis !== false
  const includeCharts = args.includeCharts !== false
  const includeVoucherList = args.includeVoucherList !== false
  const chartColors: Record<string, string> = { IDEELL: '#6aa6ff', ZWECK: '#00c853', VERMOEGEN: '#ffc107', WGB: '#9c27b0' }
  const sphereRows = data.summary.bySphere || []
  const sphereTotal = Math.max(0.0001, sphereRows.reduce((sum: number, row: any) => sum + Math.abs(Number(row.gross || 0)), 0))
  const sphereDonutSvg = () => {
    let cursor = -Math.PI / 2
    const segments = sphereRows.map((row: any) => {
      const frac = Math.abs(Number(row.gross || 0)) / sphereTotal
      const next = cursor + frac * Math.PI * 2
      const large = next - cursor > Math.PI ? 1 : 0
      const xy = (angle: number, radius: number) => [80 + radius * Math.cos(angle), 80 + radius * Math.sin(angle)]
      const [x1, y1] = xy(cursor, 72)
      const [x2, y2] = xy(next, 72)
      const [x3, y3] = xy(next, 42)
      const [x4, y4] = xy(cursor, 42)
      cursor = next
      return `<path d="M ${x1} ${y1} A 72 72 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A 42 42 0 ${large} 0 ${x4} ${y4} Z" fill="${chartColors[row.key] || '#88918a'}"/>`
    }).join('')
    return `<svg width="160" height="160" viewBox="0 0 160 160">${segments}<circle cx="80" cy="80" r="36" fill="#fff"/></svg>`
  }
  const monthlyChartSvg = () => {
    const monthly = data.monthly || []
    const max = Math.max(1, ...monthly.map((row: any) => Math.abs(Number(row.gross || 0))))
    const bars = monthly.map((row: any, idx: number) => {
      const width = 22
      const gap = 8
      const height = Math.max(3, Math.round((Math.abs(Number(row.gross || 0)) / max) * 110))
      const x = 28 + idx * (width + gap)
      const y = 132 - height
      const fill = Number(row.gross || 0) < 0 ? '#f06a6a' : '#6aa6ff'
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="${fill}"/><text x="${x + width / 2}" y="150" text-anchor="middle" font-size="9" fill="#5f665d">${esc(String(row.month || '').slice(5))}</text>`
    }).join('')
    const width = Math.max(360, 56 + monthly.length * 30)
    return `<svg width="100%" height="164" viewBox="0 0 ${width} 164"><line x1="20" y1="132" x2="${width - 16}" y2="132" stroke="#d8ded3"/>${bars}</svg>`
  }
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${esc(args.title || 'VereinO Controllingbericht')}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;margin:28px;color:#20231f}
h1{margin:0 0 4px;font-size:25px} .muted{color:#62685d;font-size:12px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
.kpi{border:1px solid #d9dfd2;border-radius:12px;padding:12px;background:#f5f7f0}
.kpi span{display:block;color:#65705e;font-size:12px}.kpi strong{display:block;margin-top:5px;font-size:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
.card{border:1px solid #dde2d6;border-radius:12px;padding:12px;break-inside:avoid}
.card h2{font-size:15px;margin:0 0 8px}
.chart-row{display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:center}.legend{display:grid;gap:5px}.legend span{display:flex;align-items:center;gap:7px}.sw{width:10px;height:10px;border-radius:3px;display:inline-block}
table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{border-bottom:1px solid #e2e6dc;padding:6px;text-align:left;vertical-align:top}th{background:#eef3e6;font-size:10px;text-transform:uppercase;letter-spacing:.04em}.right{text-align:right}.footer{margin-top:18px;color:#757b70;font-size:11px}
</style></head><body>
<h1>${esc(args.title || 'VereinO Controllingbericht')}</h1>
<div class="muted">Zeitraum ${esc(args.from)} bis ${esc(args.to)} · Format PDF · ${rows.length} Buchung(en)</div>
${includeKpis ? `<div class="kpis">
<div class="kpi"><span>Einnahmen</span><strong>${euro(data.income)}</strong></div>
<div class="kpi"><span>Ausgaben</span><strong>${euro(data.expenses)}</strong></div>
<div class="kpi"><span>Saldo</span><strong>${euro(data.saldo)}</strong></div>
</div>` : ''}
${includeCharts ? `<section class="card"><h2>Diagramme</h2><div class="chart-row"><div>${sphereDonutSvg()}</div><div class="legend">${sphereRows.map((row: any) => `<span><i class="sw" style="background:${chartColors[row.key] || '#88918a'}"></i>${esc(row.key)} · ${euro(row.gross)}</span>`).join('')}</div></div><h2 style="margin-top:14px">Monatsverlauf</h2>${monthlyChartSvg()}</section>` : ''}
<div class="grid">
<section class="card"><h2>Nach Sphäre</h2><table><tbody>${(data.summary.bySphere || []).map((row: any) => `<tr><td>${esc(row.key)}</td><td class="right">${euro(row.gross)}</td></tr>`).join('')}</tbody></table></section>
<section class="card"><h2>Nach Zahlungskonto</h2><table><tbody>${((data.summary as any).byPaymentAccount || data.summary.byPaymentMethod || []).map((row: any) => `<tr><td>${esc(row.key || row.name || 'Ohne Konto')}</td><td class="right">${euro(row.gross)}</td></tr>`).join('')}</tbody></table></section>
</div>
<section class="card"><h2>Monatswerte</h2><table><thead><tr><th>Monat</th><th class="right">Brutto</th><th class="right">Anzahl</th></tr></thead><tbody>${(data.monthly || []).map((row: any) => `<tr><td>${esc(row.month)}</td><td class="right">${euro(row.gross)}</td><td class="right">${esc(row.count || '')}</td></tr>`).join('')}</tbody></table></section>
${includeVoucherList ? `<section class="card" style="margin-top:12px"><h2>Buchungsauszug</h2><table><thead><tr><th>Datum</th><th>Nr.</th><th>Beschreibung</th><th class="right">Brutto</th></tr></thead><tbody>${topRows.map((row: any) => `<tr><td>${esc(row.date)}</td><td>${esc(row.voucherNo)}</td><td>${esc(row.description)}</td><td class="right">${euro(row.type === 'OUT' && args.amountMode === 'OUT_NEGATIVE' ? -Math.abs(Number(row.grossAmount || 0)) : row.grossAmount)}</td></tr>`).join('')}</tbody></table></section>` : ''}
<div class="footer">Erstellt durch VereinO Agent · ${new Date().toLocaleString('de-DE')}</div>
</body></html>`

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    await fs.writeFile(filePath, pdf)
  } finally {
    win.destroy()
  }
}

async function exportAgentReport(args: AgentReportExportInput) {
  const rows = reportRows(args)
  const fields = args.fields?.length ? args.fields : ['date', 'voucherNo', 'type', 'sphere', 'description', 'status', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount', 'tags']
  const dir = await ensureReportExportDir()
  const fileBase = `${args.type === 'JOURNAL' ? 'Journal' : 'Controlling'}_${reportStamp()}`
  const filePath = path.join(dir, `${fileBase}.${args.format.toLowerCase()}`)
  const outNegative = args.amountMode === 'OUT_NEGATIVE'

  if (args.format === 'CSV') {
    const header = fields.map((field) => csvValue(reportFieldLabels[field] || field)).join(';')
    const body = rows.map((row: any) => fields.map((field) => csvValue(reportCell(row, field, outNegative))).join(';')).join('\n')
    await fs.writeFile(filePath, `${header}\n${body}`, 'utf8')
  } else if (args.format === 'XLSX') {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(args.title || 'VereinO Export')
    sheet.columns = fields.map((field) => ({ header: reportFieldLabels[field] || field, key: field, width: field === 'description' ? 42 : 16 }))
    rows.forEach((row: any) => {
      const record: Record<string, unknown> = {}
      fields.forEach((field) => { record[field] = reportCell(row, field, outNegative) })
      sheet.addRow(record)
    })
    sheet.getRow(1).font = { bold: true }
    await workbook.xlsx.writeFile(filePath)
  } else {
    await exportAgentReportPdf(args, rows, filePath)
  }

  return {
    filePath,
    rowCount: rows.length,
    summary: reportSummaryData(args)
  }
}

export function createAiAgentTools(input: { context: AiContext }): AiAgentTool[] {
  return [
    {
      name: 'vereino_context_overview',
      description: 'Liefert eine kompakte Übersicht über Verein, Stammdaten, aktuelle Kennzahlen, Konten, Tags, Budgets, Mitglieder- und Rechnungsstatus.',
      readOnly: true,
      parameters: toolParameters({}),
      run: () => ({
        ok: true,
        data: input.context
      })
    },
    {
      name: 'master_data_list',
      description: 'Listet aktive Zahlungskonten, Tags, Budgets/Kategorien und Zweckbindungen für genaue ID-Zuordnungen.',
      readOnly: true,
      parameters: toolParameters({
        includeArchived: { type: 'boolean', description: 'Archivierte Budgets und inaktive Zweckbindungen einbeziehen.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({ includeArchived: z.boolean().optional() }), rawArgs)
        return {
          ok: true,
          data: {
            paymentAccounts: listPaymentAccounts({ activeOnly: true } as any),
            tags: listTags({ includeUsage: true } as any),
            budgets: listBudgets({ includeArchived: !!args.includeArchived } as any),
            earmarks: listBindings({ activeOnly: !args.includeArchived } as any)
          }
        }
      }
    },
    {
      name: 'memory_list',
      description: 'Liest persistentes VereinO-Agent-Gedächtnis, z.B. Vereinslogik, Standardkonten, wiederkehrende Zuordnungen und Nutzerpräferenzen.',
      readOnly: true,
      parameters: toolParameters({
        scope: { type: ['string', 'null'], enum: ['ORG', 'USER', 'SESSION', null] },
        limit: { type: 'number', description: 'Maximal 200.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          scope: z.enum(['ORG', 'USER', 'SESSION']).nullable().optional(),
          limit: z.number().optional()
        }), rawArgs)
        return {
          ok: true,
          data: {
            rows: listAiAgentMemory({ scope: args.scope || undefined, limit: limitNumber(args.limit, 80, 200) })
          }
        }
      }
    },
    {
      name: 'memory_upsert',
      description: 'Speichert eine explizite, wiederverwendbare VereinO-Erinnerung. Nutze dies nur, wenn der Nutzer eine Regel/Präferenz klar vorgibt oder bestätigt.',
      readOnly: false,
      parameters: toolParameters({
        scope: { type: 'string', enum: ['ORG', 'USER', 'SESSION'] },
        key: { type: 'string' },
        value: { type: 'string' },
        source: nullableString,
        confidence: { type: 'number' }
      }, ['key', 'value']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          scope: z.enum(['ORG', 'USER', 'SESSION']).optional(),
          key: z.string().min(1),
          value: z.string().min(1),
          source: z.string().nullable().optional(),
          confidence: z.number().min(0).max(1).optional()
        }), rawArgs)
        const row = upsertAiAgentMemory({
          scope: args.scope || 'ORG',
          key: args.key,
          value: args.value,
          source: args.source || 'VereinO Agent',
          confidence: args.confidence ?? 1
        })
        return { ok: true, data: row }
      }
    },
    {
      name: 'auto_rules_list',
      description: 'Liest Auto-Approve-Regeln für Agent-Drafts. Regeln speichern nicht direkt, sondern markieren sichere Review-Drafts.',
      readOnly: true,
      parameters: toolParameters({
        draftKind: nullableString,
        limit: { type: 'number', description: 'Maximal 100.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          draftKind: z.string().nullable().optional(),
          limit: z.number().optional()
        }), rawArgs)
        return { ok: true, data: { rows: listAiAgentAutoRules({ draftKind: args.draftKind || undefined, limit: limitNumber(args.limit, 50, 100) }) } }
      }
    },
    {
      name: 'auto_rule_upsert',
      description: 'Bereitet eine dauerhafte Auto-Approve-Regel vor. Nutze nur klare Nutzerwünsche wie "solche Tag-Änderungen künftig automatisch vorselektieren".',
      readOnly: false,
      parameters: toolParameters({
        name: { type: 'string' },
        draftKind: { type: 'string' },
        conditions: { type: 'object', additionalProperties: true },
        action: { type: 'string', enum: ['AUTO_PRESELECT', 'AUTO_APPLY_SAFE'] },
        enabled: { type: 'boolean' }
      }, ['name', 'draftKind']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          name: z.string().min(1),
          draftKind: z.string().min(1),
          conditions: z.record(z.string(), z.any()).optional(),
          action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']).optional(),
          enabled: z.boolean().optional()
        }), rawArgs)
        const row = upsertAiAgentAutoRule(args)
        return { ok: true, data: row }
      }
    },
    {
      name: 'vouchers_search',
      description: 'Sucht Buchungen im Journal nach Zeitraum, Text, Art, Sphäre, Zahlungskonto oder Tag.',
      readOnly: true,
      parameters: toolParameters({
        from: nullableString,
        to: nullableString,
        q: nullableString,
        type: { type: ['string', 'null'], enum: ['IN', 'OUT', 'TRANSFER', 'INTERNAL', null] },
        sphere: { type: ['string', 'null'], enum: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB', null] },
        paymentAccountId: nullableNumber,
        budgetId: nullableNumber,
        withoutBudget: { type: 'boolean', description: 'Nur Buchungen ohne Budget-Zuordnung zurückgeben.' },
        tag: nullableString,
        limit: { type: 'number', description: 'Maximal 200.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          from: z.string().nullable().optional(),
          to: z.string().nullable().optional(),
          q: z.string().nullable().optional(),
          type: z.enum(['IN', 'OUT', 'TRANSFER', 'INTERNAL']).nullable().optional(),
          sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']).nullable().optional(),
          paymentAccountId: z.number().nullable().optional(),
          budgetId: z.number().nullable().optional(),
          withoutBudget: z.boolean().optional(),
          tag: z.string().nullable().optional(),
          limit: z.number().optional()
        }), rawArgs)
        const rows = listVouchersAdvanced({
          from: args.from || undefined,
          to: args.to || undefined,
          q: args.q || undefined,
          type: args.type || undefined,
          sphere: args.sphere || undefined,
          paymentAccountId: args.paymentAccountId || undefined,
          budgetId: args.budgetId || undefined,
          tag: args.tag || undefined,
          limit: limitNumber(args.limit, 80, 200),
          sort: 'DESC'
        } as any)
        const visibleRows = args.withoutBudget
          ? rows.filter((row: any) => !row.budgetId)
          : rows
        return {
          ok: true,
          data: {
            count: visibleRows.length,
            rows: visibleRows.map((row: any) => ({
              id: row.id,
              voucherNo: row.voucherNo,
              date: row.date,
              type: row.type,
              sphere: row.sphere,
              description: row.description,
              counterparty: row.counterparty,
              grossAmount: roundMoney(row.grossAmount),
              paymentAccountId: row.paymentAccountId,
              paymentAccountName: row.paymentAccountName,
              budgetId: row.budgetId,
              budgetLabel: row.budgetLabel,
              budgetAmount: row.budgetAmount,
              tags: row.tags || []
            }))
          }
        }
      }
    },
    {
      name: 'members_search',
      description: 'Sucht Mitglieder inklusive Beitragsdaten, Status, Rollen und Tags.',
      readOnly: true,
      parameters: toolParameters({
        q: nullableString,
        status: { type: ['string', 'null'], enum: ['ACTIVE', 'PASSIVE', 'LEFT', 'ALL', null] },
        withoutEmail: { type: 'boolean', description: 'Nur Mitglieder ohne E-Mail-Adresse.' },
        withoutContributionPlan: { type: 'boolean', description: 'Nur Mitglieder ohne Beitrag/Betragsplan.' },
        limit: { type: 'number', description: 'Maximal 500.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          q: z.string().nullable().optional(),
          status: z.enum(['ACTIVE', 'PASSIVE', 'LEFT', 'ALL']).nullable().optional(),
          withoutEmail: z.boolean().optional(),
          withoutContributionPlan: z.boolean().optional(),
          limit: z.number().optional()
        }), rawArgs)
        const result = listMembers({
          q: args.q || undefined,
          status: args.status || 'ALL',
          limit: limitNumber(args.limit, 100, 500),
          sortBy: 'name',
          sort: 'ASC'
        } as any)
        const rows = (result.rows || [])
          .filter((member: any) => !args.withoutEmail || !member.email)
          .filter((member: any) => !args.withoutContributionPlan || !member.contribution_amount || !member.contribution_interval)
        return {
          ok: true,
          data: {
            total: rows.length,
            rows: rows.map((member: any) => ({
              id: member.id,
              memberNo: member.memberNo,
              name: member.name,
              status: member.status,
              boardRole: member.boardRole,
              email: member.email,
              contributionAmount: member.contribution_amount,
              contributionInterval: member.contribution_interval,
              nextDueDate: member.next_due_date,
              tags: member.tags || [],
              hasIban: !!member.iban,
              hasMandate: !!member.mandate_ref
            }))
          }
        }
      }
    },
    {
      name: 'payments_due',
      description: 'Liest offene oder bezahlte Mitgliedsbeiträge für einen Zeitraum, ein Intervall oder ein bestimmtes Mitglied.',
      readOnly: true,
      parameters: toolParameters({
        interval: { type: ['string', 'null'], enum: ['MONTHLY', 'QUARTERLY', 'YEARLY', null] },
        periodKey: nullableString,
        memberId: nullableNumber,
        includePaid: { type: 'boolean' },
        limit: { type: 'number', description: 'Maximal 300.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
          periodKey: z.string().nullable().optional(),
          memberId: z.number().nullable().optional(),
          includePaid: z.boolean().optional(),
          limit: z.number().optional()
        }), rawArgs)
        const intervals = args.interval ? [args.interval] : ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const
        const rows = intervals.flatMap((interval) => {
          const result = mp.listDue({
            interval,
            periodKey: args.periodKey || undefined,
            memberId: args.memberId || undefined,
            includePaid: !!args.includePaid
          } as any)
          return result.rows || []
        }).slice(0, limitNumber(args.limit, 120, 300))
        return {
          ok: true,
          data: {
            summary: mp.dueSummary(),
            rows
          }
        }
      }
    },
    {
      name: 'contribution_payment_link_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um bestehende Buchungen mit Mitgliedsbeitrags-Zeiträumen zu verknüpfen und diese nach Freigabe als bezahlt zu markieren. Nutze dies, wenn die Buchungen bereits existieren; nicht stattdessen neue Buchungen erstellen.',
      readOnly: false,
      parameters: toolParameters({
        links: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              memberId: { type: 'number' },
              periodKey: { type: 'string' },
              voucherId: { type: 'number' },
              interval: { type: ['string', 'null'], enum: ['MONTHLY', 'QUARTERLY', 'YEARLY', null] },
              amount: nullableNumber,
              datePaid: nullableString
            },
            required: ['memberId', 'periodKey', 'voucherId']
          }
        },
        reason: nullableString
      }, ['links']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          links: z.array(z.object({
            memberId: z.number().int().positive(),
            periodKey: z.string().min(1),
            voucherId: z.number().int().positive(),
            interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
            amount: z.number().nullable().optional(),
            datePaid: z.string().nullable().optional()
          })).min(1).max(50),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const membersResult = listMembers({ status: 'ALL', limit: 5000 } as any)
        const memberById = new Map((membersResult.rows || []).map((member: any) => [Number(member.id), member]))
        const voucherIds = Array.from(new Set(args.links.map((link) => Number(link.voucherId))))
        const voucherResult = listVouchersAdvancedPaged({
          voucherIds,
          limit: voucherIds.length,
          sort: 'ASC',
          sortBy: 'date'
        } as any)
        const voucherById = new Map((voucherResult.rows || []).map((voucher: any) => [Number(voucher.id), voucher]))
        const missingVouchers = voucherIds.filter((id) => !voucherById.has(id))
        if (missingVouchers.length) {
          return { ok: false, warning: `Diese Buchungen wurden nicht gefunden: ${missingVouchers.join(', ')}.` }
        }

        const changes = args.links.map((link, idx) => {
          const member = memberById.get(Number(link.memberId)) as any
          const voucher = voucherById.get(Number(link.voucherId)) as any
          const interval = link.interval || member?.contribution_interval || (link.periodKey.includes('-Q') ? 'QUARTERLY' : link.periodKey.includes('-') ? 'MONTHLY' : 'YEARLY')
          const dueResult = member
            ? mp.listDue({
                interval,
                memberId: Number(link.memberId),
                periodKey: link.periodKey,
                includePaid: true
              } as any)
            : { rows: [] }
          const due = (dueResult.rows || [])[0] as any
          const amount = roundMoney(link.amount ?? due?.amount ?? voucher?.grossAmount ?? voucher?.gross ?? member?.contribution_amount ?? 0)
          const warnings = [
            !member ? `Mitglied #${link.memberId} wurde nicht gefunden.` : null,
            !due ? `Beitragszeitraum ${link.periodKey} wurde fuer ${member?.name || `Mitglied #${link.memberId}`} nicht gefunden.` : null,
            due?.paid && Number(due.voucherId || 0) !== Number(link.voucherId)
              ? `Zeitraum ${link.periodKey} ist bereits mit Buchung #${due.voucherId || 'ohne Beleg'} als bezahlt markiert.`
              : null,
            Math.abs(Number(voucher?.grossAmount ?? voucher?.gross ?? amount) - amount) > 0.01
              ? `Buchungsbetrag ${roundMoney(voucher?.grossAmount ?? voucher?.gross)} EUR weicht vom Beitragsbetrag ${amount} EUR ab.`
              : null
          ].filter(Boolean)
          return {
            id: `contribution-link-${link.memberId}-${link.periodKey}-${link.voucherId}-${idx}`,
            memberId: Number(link.memberId),
            memberName: member?.name || `Mitglied #${link.memberId}`,
            periodKey: link.periodKey,
            interval,
            amount,
            voucherId: Number(link.voucherId),
            voucherNo: voucher?.voucherNo || null,
            voucherDate: voucher?.date || null,
            voucherDescription: voucher?.description || null,
            voucherGrossAmount: roundMoney(voucher?.grossAmount ?? voucher?.gross ?? amount),
            datePaid: link.datePaid || voucher?.date || new Date().toISOString().slice(0, 10),
            selected: !warnings.some((warning) => /bereits mit Buchung|nicht gefunden/i.test(String(warning))),
            applied: !!(due?.paid && Number(due.voucherId || 0) === Number(link.voucherId)),
            warnings
          }
        })

        const valid = changes.filter((change) => !change.applied && change.selected)
        return {
          ok: true,
          data: {
            message: `${valid.length} Beitrags-Verknuepfung(en) als Review-Entwurf vorbereitet.`,
            changes,
            reason: args.reason || null
          },
          draft: {
            kind: 'contributionPaymentLink',
            title: args.reason || `${changes.length} Mitgliedsbeitrag-Verknuepfung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'member_update_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um vorhandene Mitglieder zu ändern. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        memberIds: { type: 'array', items: { type: 'number' } },
        changes: {
          type: 'object',
          additionalProperties: true,
          description: 'Felder aus Mitgliederstamm, z.B. contribution_amount, contribution_interval, status, boardRole, next_due_date, notes.'
        },
        reason: nullableString
      }, ['memberIds', 'changes']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          memberIds: z.array(z.number()).min(1).max(100),
          changes: z.record(z.string(), z.any()),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const result = listMembers({ status: 'ALL', limit: 1000 } as any)
        const memberById = new Map((result.rows || []).map((member: any) => [Number(member.id), member]))
        const changes = args.memberIds.flatMap((memberId) => {
          const member = memberById.get(Number(memberId)) as any
          if (!member) return []
          return memberUpdateChangesFor(member, args.changes, 'agent-member-update')
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} Mitgliederänderung(en) als Review-Entwurf vorbereitet.`,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'memberUpdate',
            title: args.reason || `${changes.length} Mitgliederänderung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'member_bulk_update_draft_prepare',
      description: 'Bereitet einen Review-Entwurf für individuelle Mitgliederänderungen vor, wenn jedes Mitglied eigene Werte bekommt, z.B. unterschiedliche E-Mail-Adressen. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              memberId: { type: 'number' },
              changes: {
                type: 'object',
                additionalProperties: true,
                description: `Erlaubte Felder: ${memberUpdateFields.join(', ')}.`
              }
            },
            required: ['memberId', 'changes']
          }
        },
        reason: nullableString
      }, ['items']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          items: z.array(z.object({
            memberId: z.number().int().positive(),
            changes: z.record(z.string(), z.any())
          })).min(1).max(200),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const result = listMembers({ status: 'ALL', limit: 2000 } as any)
        const memberById = new Map((result.rows || []).map((member: any) => [Number(member.id), member]))
        const changes = args.items.flatMap((item) => {
          const member = memberById.get(Number(item.memberId)) as any
          if (!member) return []
          return memberUpdateChangesFor(member, item.changes, 'agent-member-bulk-update')
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} individuelle Mitgliederänderung(en) als Review-Entwurf vorbereitet.`,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'memberUpdate',
            title: args.reason || `${changes.length} individuelle Mitgliederänderung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'member_email_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um fehlende oder ausgewählte Mitglieder-E-Mail-Adressen nach Namensschema zu setzen, z.B. Vorname.Nachname@verein.de. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        domain: { type: 'string', description: 'Domain ohne @, z.B. vereino.de.' },
        pattern: { type: 'string', enum: ['first.last', 'first_last', 'firstlast', 'full.name'] },
        onlyMissing: { type: 'boolean' },
        includeLeft: { type: 'boolean' },
        memberIds: { type: 'array', items: { type: 'number' } },
        reason: nullableString
      }, ['domain']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          domain: z.string().min(3),
          pattern: z.enum(['first.last', 'first_last', 'firstlast', 'full.name']).optional(),
          onlyMissing: z.boolean().optional(),
          includeLeft: z.boolean().optional(),
          memberIds: z.array(z.number().int().positive()).optional(),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const result = listMembers({ status: 'ALL', limit: 2000, sortBy: 'name', sort: 'ASC' } as any)
        const wantedIds = args.memberIds?.length ? new Set(args.memberIds.map(Number)) : null
        const rows = (result.rows || [])
          .filter((member: any) => !wantedIds || wantedIds.has(Number(member.id)))
          .filter((member: any) => args.includeLeft || member.status !== 'LEFT')
          .filter((member: any) => args.onlyMissing === false || !member.email)
        const pattern = args.pattern || 'first.last'
        const changes = rows.flatMap((member: any) => {
          const email = emailFromMemberName(member.name, args.domain, pattern)
          if (!email) return []
          return memberUpdateChangesFor(member, { email }, 'agent-member-email')
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} E-Mail-Änderung(en) als Review-Entwurf vorbereitet.`,
            pattern,
            domain: args.domain,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'memberUpdate',
            title: args.reason || `${changes.length} Mitglieder-E-Mail-Adresse(n) setzen`,
            payload: {
              changes,
              reason: args.reason || `E-Mail-Adressen nach Schema ${pattern}@${args.domain} setzen`
            }
          }
        }
      }
    },
    {
      name: 'tag_change_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um Tags anzulegen, umzubenennen oder zu löschen. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        changes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
              tagId: nullableNumber,
              name: { type: 'string' },
              color: nullableString
            },
            required: ['action', 'name']
          }
        },
        reason: nullableString
      }, ['changes']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          changes: z.array(z.object({
            action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
            tagId: z.number().nullable().optional(),
            name: z.string().min(1),
            color: z.string().nullable().optional()
          })).min(1).max(100),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const existing = listTags({ includeUsage: true } as any) || []
        const byName = new Map(existing.map((tag: any) => [normalizeLookup(tag.name), tag]))
        const byId = new Map(existing.map((tag: any) => [Number(tag.id), tag]))
        const changes = args.changes.map((change, idx) => {
          const current = change.tagId ? byId.get(Number(change.tagId)) : byName.get(normalizeLookup(change.name))
          return {
            id: `agent-tag-${change.action.toLowerCase()}-${change.tagId || normalizeLookup(change.name)}-${idx}`,
            action: change.action,
            tagId: change.tagId ?? current?.id,
            name: change.name,
            oldDisplay: current?.name || 'nicht vorhanden',
            newDisplay: change.action === 'DELETE' ? 'löschen' : change.name,
            color: change.color ?? current?.color ?? null,
            selected: true
          }
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} Tag-Änderung(en) als Review-Entwurf vorbereitet.`,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'tagChange',
            title: args.reason || `${changes.length} Tag-Änderung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'budget_change_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um Budgets/Kategorien anzulegen, zu ändern, zu archivieren oder zu löschen. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        changes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
              budgetId: nullableNumber,
              name: nullableString,
              categoryName: nullableString,
              projectName: nullableString,
              year: nullableNumber,
              sphere: { type: ['string', 'null'], enum: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB', null] },
              earmarkId: nullableNumber,
              amountPlanned: nullableNumber,
              startDate: nullableString,
              endDate: nullableString,
              color: nullableString,
              isArchived: { type: ['boolean', 'null'] },
              enforceTimeRange: { type: ['boolean', 'null'] }
            },
            required: ['action']
          }
        },
        reason: nullableString
      }, ['changes']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          changes: z.array(z.object({
            action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
            budgetId: z.number().nullable().optional(),
            name: z.string().nullable().optional(),
            categoryName: z.string().nullable().optional(),
            projectName: z.string().nullable().optional(),
            year: z.number().nullable().optional(),
            sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']).nullable().optional(),
            earmarkId: z.number().nullable().optional(),
            amountPlanned: z.number().nullable().optional(),
            startDate: z.string().nullable().optional(),
            endDate: z.string().nullable().optional(),
            color: z.string().nullable().optional(),
            isArchived: z.boolean().nullable().optional(),
            enforceTimeRange: z.boolean().nullable().optional()
          })).min(1).max(80),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const budgets = listBudgets({ includeArchived: true } as any) || []
        const byId = new Map(budgets.map((budget: any) => [Number(budget.id), budget]))
        const byName = new Map(budgets.map((budget: any) => [normalizeLookup(budgetLabel(budget)), budget]))
        const currentYear = new Date().getFullYear()
        const changes = args.changes.map((change, idx) => {
          const requestedName = change.categoryName || change.projectName || change.name || ''
          const current = change.budgetId ? byId.get(Number(change.budgetId)) : requestedName ? byName.get(normalizeLookup(requestedName)) : null
          const action = change.action
          const label = requestedName || budgetLabel(current) || `Budget ${idx + 1}`
          const payload = action === 'DELETE'
            ? null
            : {
              ...(action === 'UPDATE' && current?.id ? { id: Number(current.id) } : {}),
              year: Number(change.year ?? current?.year ?? currentYear),
              sphere: change.sphere ?? current?.sphere ?? 'IDEELL',
              categoryId: current?.categoryId ?? null,
              projectId: current?.projectId ?? null,
              earmarkId: change.earmarkId ?? current?.earmarkId ?? null,
              amountPlanned: roundMoney(change.amountPlanned ?? current?.amountPlanned ?? 0),
              name: change.name ?? current?.name ?? label,
              categoryName: change.categoryName ?? current?.categoryName ?? label,
              projectName: change.projectName ?? current?.projectName ?? null,
              startDate: change.startDate ?? current?.startDate ?? null,
              endDate: change.endDate ?? current?.endDate ?? null,
              color: change.color ?? current?.color ?? null,
              isArchived: change.isArchived ?? Boolean(current?.isArchived ?? false),
              enforceTimeRange: change.enforceTimeRange ?? Boolean(current?.enforceTimeRange ?? false)
            }
          return {
            id: `agent-budget-${action.toLowerCase()}-${change.budgetId || normalizeLookup(label)}-${idx}`,
            action,
            budgetId: change.budgetId ?? current?.id ?? null,
            name: label,
            oldDisplay: budgetDisplay(current),
            newDisplay: action === 'DELETE' ? 'löschen' : budgetPayloadDisplay(payload),
            payload,
            selected: true
          }
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} Budget-Änderung(en) als Review-Entwurf vorbereitet.`,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'budgetChange',
            title: args.reason || `${changes.length} Budget-Änderung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'earmark_change_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um Zweckbindungen anzulegen, zu ändern, zu deaktivieren oder zu löschen. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        changes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
              earmarkId: nullableNumber,
              code: nullableString,
              name: nullableString,
              description: nullableString,
              startDate: nullableString,
              endDate: nullableString,
              isActive: { type: ['boolean', 'null'] },
              color: nullableString,
              budget: nullableNumber,
              enforceTimeRange: { type: ['boolean', 'null'] }
            },
            required: ['action']
          }
        },
        reason: nullableString
      }, ['changes']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          changes: z.array(z.object({
            action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
            earmarkId: z.number().nullable().optional(),
            code: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            startDate: z.string().nullable().optional(),
            endDate: z.string().nullable().optional(),
            isActive: z.boolean().nullable().optional(),
            color: z.string().nullable().optional(),
            budget: z.number().nullable().optional(),
            enforceTimeRange: z.boolean().nullable().optional()
          })).min(1).max(80),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const earmarks = listBindings({ activeOnly: false } as any) || []
        const byId = new Map(earmarks.map((earmark: any) => [Number(earmark.id), earmark]))
        const byName = new Map(earmarks.flatMap((earmark: any) => [
          [normalizeLookup(earmark.name), earmark],
          [normalizeLookup(earmark.code), earmark],
          [normalizeLookup(earmarkLabel(earmark)), earmark]
        ]))
        const changes = args.changes.map((change, idx) => {
          const requestedName = change.name || change.code || ''
          const current = change.earmarkId ? byId.get(Number(change.earmarkId)) : requestedName ? byName.get(normalizeLookup(requestedName)) : null
          const action = change.action
          const label = requestedName || earmarkLabel(current) || `Zweckbindung ${idx + 1}`
          const payload = action === 'DELETE'
            ? null
            : {
              ...(action === 'UPDATE' && current?.id ? { id: Number(current.id) } : {}),
              code: change.code ?? current?.code ?? makeEarmarkCode(label),
              name: change.name ?? current?.name ?? label,
              description: change.description ?? current?.description ?? null,
              startDate: change.startDate ?? current?.startDate ?? null,
              endDate: change.endDate ?? current?.endDate ?? null,
              isActive: change.isActive ?? (current ? current.isActive !== 0 : true),
              color: change.color ?? current?.color ?? null,
              budget: change.budget ?? current?.budget ?? null,
              enforceTimeRange: change.enforceTimeRange ?? Boolean(current?.enforceTimeRange ?? false)
            }
          return {
            id: `agent-earmark-${action.toLowerCase()}-${change.earmarkId || normalizeLookup(label)}-${idx}`,
            action,
            earmarkId: change.earmarkId ?? current?.id ?? null,
            name: label,
            oldDisplay: earmarkDisplay(current),
            newDisplay: action === 'DELETE' ? 'löschen' : earmarkPayloadDisplay(payload),
            payload,
            selected: true
          }
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} Zweckbindungs-Änderung(en) als Review-Entwurf vorbereitet.`,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'earmarkChange',
            title: args.reason || `${changes.length} Zweckbindungs-Änderung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'reports_summary',
      description: 'Berechnet Finanzsummen, Monatswerte und Kontostände für einen Zeitraum.',
      readOnly: true,
      parameters: toolParameters({
        from: { type: 'string' },
        to: { type: 'string' },
        type: { type: ['string', 'null'], enum: ['IN', 'OUT', null] }
      }, ['from', 'to']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          from: z.string(),
          to: z.string(),
          type: z.enum(['IN', 'OUT']).nullable().optional()
        }), rawArgs)
        const filters = { from: args.from, to: args.to, type: args.type || undefined } as any
        return {
          ok: true,
          data: {
            summary: summarizeVouchers(filters),
            monthly: monthlyVouchers(filters),
            cashBalance: cashBalance({ to: args.to } as any)
          }
        }
      }
    },
    {
      name: 'reports_export',
      description: 'Exportiert einen VereinO-Controlling-/Journalbericht als PDF, CSV oder XLSX und gibt den Dateipfad zurück. Nutze dieses Tool, wenn der Nutzer einen Bericht exportieren, speichern oder als Datei/PDF/Excel/CSV erhalten will.',
      readOnly: false,
      parameters: toolParameters({
        type: { type: 'string', enum: ['JOURNAL', 'SPHERE_SUMMARY', 'BUDGET_VS_ACTUAL', 'EARMARK_USAGE'] },
        format: { type: 'string', enum: ['PDF', 'CSV', 'XLSX'] },
        from: { type: 'string', description: 'ISO-Datum YYYY-MM-DD.' },
        to: { type: 'string', description: 'ISO-Datum YYYY-MM-DD.' },
        filters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            paymentMethod: { type: ['string', 'null'], enum: ['BAR', 'BANK', null] },
            paymentAccountId: nullableNumber,
            sphere: { type: ['string', 'null'], enum: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB', null] },
            type: { type: ['string', 'null'], enum: ['IN', 'OUT', 'TRANSFER', 'INTERNAL', null] },
            earmarkId: nullableNumber,
            budgetId: nullableNumber,
            q: nullableString,
            tag: nullableString
          }
        },
        fields: { type: 'array', items: { type: 'string', enum: ['date', 'voucherNo', 'type', 'sphere', 'description', 'status', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount', 'tags'] } },
        amountMode: { type: ['string', 'null'], enum: ['POSITIVE_BOTH', 'OUT_NEGATIVE', null] },
        sort: { type: ['string', 'null'], enum: ['ASC', 'DESC', null] },
        sortBy: { type: ['string', 'null'], enum: ['date', 'gross', 'net', 'attachments', 'budget', 'earmark', 'payment', 'sphere', null] },
        title: nullableString,
        includeKpis: { type: ['boolean', 'null'], description: 'KPIs im PDF aufnehmen. Standard: true.' },
        includeCharts: { type: ['boolean', 'null'], description: 'Diagramme im PDF aufnehmen. Standard: true.' },
        includeVoucherList: { type: ['boolean', 'null'], description: 'Buchungsauszug im PDF aufnehmen. Standard: true.' }
      }, ['type', 'format', 'from', 'to']),
      run: async (rawArgs) => {
        const args = parseArgs(z.object({
          type: z.enum(['JOURNAL', 'SPHERE_SUMMARY', 'BUDGET_VS_ACTUAL', 'EARMARK_USAGE']),
          format: z.enum(['PDF', 'CSV', 'XLSX']),
          from: z.string(),
          to: z.string(),
          filters: z.record(z.any()).optional(),
          fields: z.array(z.enum(['date', 'voucherNo', 'type', 'sphere', 'description', 'status', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount', 'tags'])).optional(),
          amountMode: z.enum(['POSITIVE_BOTH', 'OUT_NEGATIVE']).nullable().optional(),
          sort: z.enum(['ASC', 'DESC']).nullable().optional(),
          sortBy: z.enum(['date', 'gross', 'net', 'attachments', 'budget', 'earmark', 'payment', 'sphere']).nullable().optional(),
          title: z.string().nullable().optional(),
          includeKpis: z.boolean().nullable().optional(),
          includeCharts: z.boolean().nullable().optional(),
          includeVoucherList: z.boolean().nullable().optional()
        }), rawArgs)
        const exported = await exportAgentReport({
          ...args,
          amountMode: args.amountMode || 'OUT_NEGATIVE',
          sort: args.sort || 'ASC',
          sortBy: args.sortBy || 'date'
        })
        return {
          ok: true,
          data: {
            message: `${args.format}-Report exportiert.`,
            filePath: exported.filePath,
            rowCount: exported.rowCount,
            period: { from: args.from, to: args.to },
            summary: exported.summary
          },
          draft: {
            kind: 'reportExport',
            title: args.title || `${args.format}-Report ${args.from} bis ${args.to}`,
            payload: {
              filePath: exported.filePath,
              format: args.format,
              type: args.type,
              rowCount: exported.rowCount,
              from: args.from,
              to: args.to,
              summary: exported.summary
            }
          }
        }
      }
    },
    {
      name: 'content_pdf_export',
      description: 'Exportiert eine vom Agenten formulierte Antwort, Tabelle, Liste oder den relevanten Inhalt aus dem aktuellen Chat-/UI-Kontext als PDF und gibt den Dateipfad zurück. Nutze dies bei Folgeaufträgen wie "diese Tabelle als PDF", "Antwort als PDF", "Liste speichern" oder "als Datei geben", wenn kein standardisierter Controlling-, Finanzamt- oder Kassierbericht gemeint ist.',
      readOnly: false,
      parameters: toolParameters({
        title: { type: 'string', description: 'PDF-Titel.' },
        body: { type: 'string', description: 'Der komplette PDF-Inhalt als Markdown. Tabellen sollen als Markdown-Tabelle uebergeben werden.' },
        fileName: nullableString
      }, ['title', 'body']),
      run: async (rawArgs) => {
        const args = parseArgs(z.object({
          title: z.string().min(1),
          body: z.string().min(1),
          fileName: z.string().nullable().optional()
        }), rawArgs)
        const exported = await exportAgentContentPdf(args)
        return {
          ok: true,
          data: {
            message: 'PDF exportiert.',
            filePath: exported.filePath
          },
          draft: {
            kind: 'reportExport',
            title: args.title,
            payload: {
              filePath: exported.filePath,
              format: 'PDF',
              type: 'CONTENT',
              source: 'agent-content'
            }
          }
        }
      }
    },
    {
      name: 'reports_export_fiscal',
      description: 'Exportiert den spezialisierten Jahresabschluss für das Finanzamt als PDF. Nutze dies bei Finanzamt, Jahresabschluss, Steuer-/§64-AO-Bericht oder Gemeinnützigkeitsnachweis.',
      readOnly: false,
      parameters: toolParameters({
        fiscalYear: { type: 'number' },
        includeBindings: { type: 'boolean' },
        includeVoucherList: { type: 'boolean' },
        includeBudgets: { type: 'boolean' },
        includeActivityReport: { type: 'boolean' },
        includeInactiveBindings: { type: 'boolean' },
        includeArchivedBudgets: { type: 'boolean' },
        includeInternalVouchers: { type: 'boolean' },
        bindingIds: { type: 'array', items: { type: 'number' } },
        budgetIds: { type: 'array', items: { type: 'number' } },
        orgName: nullableString
      }, ['fiscalYear']),
      run: async (rawArgs) => {
        const args = parseArgs(z.object({
          fiscalYear: z.number(),
          includeBindings: z.boolean().optional(),
          includeVoucherList: z.boolean().optional(),
          includeBudgets: z.boolean().optional(),
          includeActivityReport: z.boolean().optional(),
          includeInactiveBindings: z.boolean().optional(),
          includeArchivedBudgets: z.boolean().optional(),
          includeInternalVouchers: z.boolean().optional(),
          bindingIds: z.array(z.number()).optional(),
          budgetIds: z.array(z.number()).optional(),
          orgName: z.string().nullable().optional()
        }), rawArgs)
        const { generateFiscalReportPDF } = await import('./fiscalReport')
        const result = await generateFiscalReportPDF({
          fiscalYear: args.fiscalYear,
          from: `${args.fiscalYear}-01-01`,
          to: `${args.fiscalYear}-12-31`,
          includeBindings: args.includeBindings ?? true,
          includeVoucherList: args.includeVoucherList ?? true,
          includeBudgets: args.includeBudgets ?? true,
          includeActivityReport: args.includeActivityReport ?? false,
          includeInactiveBindings: args.includeInactiveBindings ?? false,
          includeArchivedBudgets: args.includeArchivedBudgets ?? false,
          includeInternalVouchers: args.includeInternalVouchers ?? false,
          bindingIds: args.bindingIds,
          budgetIds: args.budgetIds,
          orgName: args.orgName || undefined
        })
        return {
          ok: true,
          data: { message: `Finanzamt-PDF ${args.fiscalYear} exportiert.`, filePath: result.filePath },
          draft: {
            kind: 'reportExport',
            title: `Finanzamt-Jahresabschluss ${args.fiscalYear}`,
            payload: { filePath: result.filePath, format: 'PDF', type: 'FISCAL', from: `${args.fiscalYear}-01-01`, to: `${args.fiscalYear}-12-31` }
          }
        }
      }
    },
    {
      name: 'reports_export_treasurer',
      description: 'Exportiert den Kassierbericht/Kassenbericht für Mitglieder oder Mitgliederversammlung als PDF.',
      readOnly: false,
      parameters: toolParameters({
        fiscalYear: { type: 'number' },
        orgName: nullableString,
        cashBalanceDate: nullableString,
        includeMembers: { type: 'boolean' },
        includeInvoices: { type: 'boolean' },
        includeBindings: { type: 'boolean' },
        includeBudgets: { type: 'boolean' },
        includeTagSummary: { type: 'boolean' },
        includeVoucherList: { type: 'boolean' },
        includeTags: { type: 'boolean' },
        includeInternalVouchers: { type: 'boolean' },
        voucherListFrom: nullableString,
        voucherListTo: nullableString,
        voucherListSort: { type: ['string', 'null'], enum: ['ASC', 'DESC', null] }
      }, ['fiscalYear']),
      run: async (rawArgs) => {
        const args = parseArgs(z.object({
          fiscalYear: z.number(),
          orgName: z.string().nullable().optional(),
          cashBalanceDate: z.string().nullable().optional(),
          includeMembers: z.boolean().optional(),
          includeInvoices: z.boolean().optional(),
          includeBindings: z.boolean().optional(),
          includeBudgets: z.boolean().optional(),
          includeTagSummary: z.boolean().optional(),
          includeVoucherList: z.boolean().optional(),
          includeTags: z.boolean().optional(),
          includeInternalVouchers: z.boolean().optional(),
          voucherListFrom: z.string().nullable().optional(),
          voucherListTo: z.string().nullable().optional(),
          voucherListSort: z.enum(['ASC', 'DESC']).nullable().optional()
        }), rawArgs)
        const { generateTreasurerReportPDF } = await import('./treasurerReport')
        const result = await generateTreasurerReportPDF({
          fiscalYear: args.fiscalYear,
          from: `${args.fiscalYear}-01-01`,
          to: `${args.fiscalYear}-12-31`,
          orgName: args.orgName || undefined,
          cashBalanceDate: args.cashBalanceDate || undefined,
          includeMembers: args.includeMembers ?? true,
          includeInvoices: args.includeInvoices ?? true,
          includeBindings: args.includeBindings ?? true,
          includeBudgets: args.includeBudgets ?? true,
          includeTagSummary: args.includeTagSummary ?? true,
          includeVoucherList: args.includeVoucherList ?? true,
          includeTags: args.includeTags ?? true,
          includeInternalVouchers: args.includeInternalVouchers ?? false,
          voucherListFrom: args.voucherListFrom || undefined,
          voucherListTo: args.voucherListTo || undefined,
          voucherListSort: args.voucherListSort || 'ASC'
        })
        return {
          ok: true,
          data: { message: `Kassierbericht ${args.fiscalYear} exportiert.`, filePath: result.filePath },
          draft: {
            kind: 'reportExport',
            title: `Kassierbericht ${args.fiscalYear}`,
            payload: { filePath: result.filePath, format: 'PDF', type: 'TREASURER', from: `${args.fiscalYear}-01-01`, to: `${args.fiscalYear}-12-31` }
          }
        }
      }
    },
    {
      name: 'invoices_search',
      description: 'Sucht Rechnungen, Forderungen, Verbindlichkeiten und offene Posten.',
      readOnly: true,
      parameters: toolParameters({
        status: { type: ['string', 'null'], enum: ['OPEN', 'PAID', 'PARTIAL', 'OVERDUE', 'ALL', null] },
        q: nullableString,
        limit: { type: 'number', description: 'Maximal 200.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          status: z.enum(['OPEN', 'PAID', 'PARTIAL', 'OVERDUE', 'ALL']).nullable().optional(),
          q: z.string().nullable().optional(),
          limit: z.number().optional()
        }), rawArgs)
        const result = listInvoicesPaged({
          status: args.status && args.status !== 'ALL' ? args.status : undefined,
          q: args.q || undefined,
          limit: limitNumber(args.limit, 80, 200),
          sortBy: 'due',
          sort: 'ASC'
        } as any)
        return {
          ok: true,
          data: {
            summary: summarizeInvoices({ status: args.status && args.status !== 'ALL' ? args.status : undefined } as any),
            rows: result.rows || []
          }
        }
      }
    },
    {
      name: 'invoice_action_draft_prepare',
      description: 'Bereitet einen Review-Entwurf zum Anlegen einer Forderung (IN) oder Verbindlichkeit/Rechnung (OUT) vor. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        voucherType: { type: 'string', enum: ['IN', 'OUT'], description: 'IN = Forderung, OUT = Verbindlichkeit/Rechnung.' },
        date: { type: 'string', description: 'Beleg-/Rechnungsdatum im ISO-Format YYYY-MM-DD.' },
        dueDate: nullableString,
        invoiceNo: nullableString,
        party: { type: 'string', description: 'Debitor/Kreditor bzw. Gegenpartei.' },
        description: nullableString,
        grossAmount: { type: 'number', description: 'Bruttobetrag positiv in EUR.' },
        sphere: { type: 'string', enum: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] },
        paymentMethod: nullableString,
        paymentAccountId: nullableNumber,
        budgetId: nullableNumber,
        earmarkId: nullableNumber,
        tags: { type: 'array', items: { type: 'string' } },
        reason: nullableString
      }, ['voucherType', 'date', 'party', 'grossAmount', 'sphere']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          voucherType: z.enum(['IN', 'OUT']),
          date: z.string().min(1),
          dueDate: z.string().nullable().optional(),
          invoiceNo: z.string().nullable().optional(),
          party: z.string().min(1),
          description: z.string().nullable().optional(),
          grossAmount: z.number().positive(),
          sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']),
          paymentMethod: z.string().nullable().optional(),
          paymentAccountId: z.number().nullable().optional(),
          budgetId: z.number().nullable().optional(),
          earmarkId: z.number().nullable().optional(),
          tags: z.array(z.string()).optional(),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const payload = {
          action: 'CREATE',
          invoice: {
            date: args.date,
            dueDate: args.dueDate || null,
            invoiceNo: args.invoiceNo || null,
            party: args.party,
            description: args.description || null,
            grossAmount: roundMoney(args.grossAmount),
            paymentMethod: args.paymentMethod || null,
            paymentAccountId: args.paymentAccountId ?? null,
            sphere: args.sphere,
            earmarkId: args.earmarkId ?? null,
            budgetId: args.budgetId ?? null,
            autoPost: true,
            voucherType: args.voucherType,
            tags: args.tags || []
          },
          reason: args.reason || null
        }
        const label = args.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'
        return {
          ok: true,
          draft: {
            kind: 'invoiceAction',
            title: `${label} für ${args.party}`,
            payload
          },
          data: {
            message: `${label} wurde als Review-Entwurf vorbereitet.`,
            invoice: payload.invoice
          }
        }
      }
    },
    {
      name: 'bank_transactions_open',
      description: 'Liest offene Banktransaktionen samt lokalen möglichen Buchungstreffern.',
      readOnly: true,
      parameters: toolParameters({
        limit: { type: 'number', description: 'Maximal 50.' }
      }),
      run: (rawArgs) => {
        const args = parseArgs(z.object({ limit: z.number().optional() }), rawArgs)
        const result = listBankTransactions({
          status: 'OPEN',
          sortBy: 'date',
          sortDir: 'DESC',
          page: 1,
          limit: limitNumber(args.limit, 20, 50)
        } as any) as any
        return {
          ok: true,
          data: {
            total: result.total,
            rows: (result.rows || []).map((transaction: any) => ({
              ...transaction,
              matches: findBankTransactionMatches({ id: transaction.id, includeAllDates: false } as any)
                .filter((match: any) => Number(match.score || 0) > 0)
                .slice(0, 5)
            }))
          }
        }
      }
    },
    {
      name: 'bank_transaction_link_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um offene Bankimportbelege mit bereits vorhandenen passenden Buchungen zu verknüpfen. Nutze dies bei "Bankbeleg/Bankimport mit Buchung verknüpfen/zuordnen". Das storniert nichts und legt keine Ersatzbuchung an.',
      readOnly: false,
      parameters: toolParameters({
        links: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              bankTransactionId: { type: 'number' },
              voucherId: { type: 'number' }
            },
            required: ['bankTransactionId', 'voucherId']
          }
        },
        reason: nullableString
      }, ['links']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          links: z.array(z.object({
            bankTransactionId: z.number().int().positive(),
            voucherId: z.number().int().positive()
          })).min(1).max(50),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const voucherIds = [...new Set(args.links.map((link) => Number(link.voucherId)))]
        const voucherResult = listVouchersAdvancedPaged({
          voucherIds,
          limit: voucherIds.length,
          sort: 'ASC',
          sortBy: 'date'
        } as any)
        const vouchersById = new Map((voucherResult.rows || []).map((row: any) => [Number(row.id), row]))
        const changes: any[] = []
        const warnings: string[] = []

        for (const link of args.links) {
          let transaction: any
          try {
            transaction = getBankTransaction(link.bankTransactionId)
          } catch (error: any) {
            warnings.push(`Bankbeleg #${link.bankTransactionId}: ${error?.message || 'nicht gefunden'}.`)
            continue
          }
          const voucher = vouchersById.get(Number(link.voucherId)) as any
          if (!voucher) {
            warnings.push(`Buchung #${link.voucherId} wurde nicht gefunden.`)
            continue
          }
          if (transaction.status !== 'OPEN') {
            warnings.push(`Bankbeleg #${link.bankTransactionId} ist nicht offen.`)
            continue
          }
          if (voucher.reversedById || voucher.originalId) {
            warnings.push(`Buchung ${voucher.voucherNo || `#${voucher.id}`} ist storniert oder selbst eine Stornobuchung.`)
            continue
          }
          if (voucher.type !== transaction.direction) {
            warnings.push(`Bankbeleg #${link.bankTransactionId} passt vom Typ nicht zu ${voucher.voucherNo || `#${voucher.id}`}.`)
            continue
          }
          if (roundMoney(voucher.grossAmount) !== roundMoney(transaction.amount)) {
            warnings.push(`Bankbeleg #${link.bankTransactionId} passt vom Betrag nicht zu ${voucher.voucherNo || `#${voucher.id}`}.`)
            continue
          }
          changes.push({
            id: `agent-bank-link-${transaction.id}-${voucher.id}`,
            bankTransactionId: Number(transaction.id),
            bankBookingDate: transaction.bookingDate,
            bankDirection: transaction.direction,
            bankAmount: roundMoney(transaction.amount),
            bankCounterparty: transaction.counterparty ?? null,
            bankPurpose: transaction.purpose ?? null,
            bankReference: transaction.bankReference ?? null,
            paymentAccountName: transaction.paymentAccountName ?? null,
            voucherId: Number(voucher.id),
            voucherNo: voucher.voucherNo,
            voucherDate: voucher.date,
            voucherType: voucher.type,
            voucherDescription: voucher.description,
            voucherGrossAmount: roundMoney(voucher.grossAmount),
            selected: true
          })
        }

        if (!changes.length) {
          return {
            ok: false,
            warning: warnings[0] || 'Es wurde keine kompatible Bankbeleg-Verknüpfung gefunden.'
          }
        }

        return {
          ok: true,
          data: {
            message: `${changes.length} Bankbeleg-Verknüpfung(en) als Review-Entwurf vorbereitet.`,
            warnings
          },
          draft: {
            kind: 'bankLink',
            title: args.reason || `${changes.length} Bankbeleg(e) verknüpfen`,
            payload: {
              changes,
              reason: args.reason || null,
              warnings
            }
          }
        }
      }
    },
    {
      name: 'voucher_update_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um vorhandene Buchungen mit Budget, Zweckbindung, Notiz oder Tags zu aktualisieren. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        voucherIds: { type: 'array', items: { type: 'number' } },
        budgetId: nullableNumber,
        budgetName: nullableString,
        budgetAssignments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              budgetId: nullableNumber,
              budgetName: nullableString,
              amount: nullableNumber
            }
          },
          description: 'Mehrere Budget-Zuordnungen fuer dieselbe Buchung. amount ist der positive Bruttoteilbetrag in EUR.'
        },
        earmarkId: nullableNumber,
        earmarkName: nullableString,
        addTags: { type: 'array', items: { type: 'string' } },
        noteAppend: nullableString,
        reason: nullableString
      }, ['voucherIds']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          voucherIds: z.array(z.number()).min(1).max(100),
          budgetId: z.number().nullable().optional(),
          budgetName: z.string().nullable().optional(),
          budgetAssignments: z.array(z.object({
            budgetId: z.number().nullable().optional(),
            budgetName: z.string().nullable().optional(),
            amount: z.number().nullable().optional()
          })).optional(),
          earmarkId: z.number().nullable().optional(),
          earmarkName: z.string().nullable().optional(),
          addTags: z.array(z.string()).optional(),
          noteAppend: z.string().nullable().optional(),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const requestedBudgetAssignments = (args.budgetAssignments || []).filter((item) => item.budgetId != null || !!item.budgetName)
        const hasBudgetChange = Object.prototype.hasOwnProperty.call(args, 'budgetId') || !!args.budgetName || requestedBudgetAssignments.length > 0
        const hasEarmarkChange = Object.prototype.hasOwnProperty.call(args, 'earmarkId') || !!args.earmarkName
        if (!hasBudgetChange && !hasEarmarkChange && !(args.addTags || []).length && !args.noteAppend) {
          return { ok: false, warning: 'Es wurde keine konkrete Änderung für den Buchungsentwurf angegeben.' }
        }
        const intentText = normalizeLookup([args.reason, args.noteAppend, ...(args.addTags || [])].filter(Boolean).join(' '))
        if (/(storn|storno|duplikat|dublette|doppelt|falsch|falsche|in statt out|out statt in|soll out|soll in|typ|richtung|gegenbuchung)/.test(intentText)) {
          return {
            ok: false,
            warning: 'Dieser Auftrag klingt nach Storno/Korrektur einer Buchung, nicht nach Metadatenänderung. Nutze voucher_reverse_draft_prepare für reine Stornos oder voucher_rebook_draft_prepare für Storno plus korrigierte Ersatzbuchung.'
          }
        }
        const voucherResult = listVouchersAdvancedPaged({
          voucherIds: args.voucherIds,
          limit: args.voucherIds.length,
          sort: 'ASC',
          sortBy: 'date'
        } as any)
        const budgets = listBudgets({ includeArchived: true } as any) || []
        const budget = args.budgetId != null
          ? budgets.find((item: any) => Number(item.id) === Number(args.budgetId))
          : args.budgetName
            ? budgets.find((item: any) => normalizeLookup(budgetLabel(item)) === normalizeLookup(args.budgetName))
            : null
        const resolveBudgetTarget = (target: { budgetId?: number | null; budgetName?: string | null }) => {
          if (target.budgetId != null) {
            const row = budgets.find((item: any) => Number(item.id) === Number(target.budgetId))
            return {
              budgetId: row?.id ?? target.budgetId,
              label: row ? budgetLabel(row) : `Budget #${target.budgetId}`
            }
          }
          if (target.budgetName) {
            const row = budgets.find((item: any) => normalizeLookup(budgetLabel(item)) === normalizeLookup(target.budgetName))
            return {
              budgetId: row?.id ?? null,
              label: row ? budgetLabel(row) : target.budgetName
            }
          }
          return { budgetId: null, label: null }
        }
        const earmarks = listBindings({ activeOnly: false } as any) || []
        const earmark = args.earmarkId != null
          ? earmarks.find((item: any) => Number(item.id) === Number(args.earmarkId))
          : args.earmarkName
            ? earmarks.find((item: any) => normalizeLookup(`${item.code || ''} ${item.name || ''}`) === normalizeLookup(args.earmarkName) || normalizeLookup(item.name) === normalizeLookup(args.earmarkName) || normalizeLookup(item.code) === normalizeLookup(args.earmarkName))
            : null
        const changes = (voucherResult.rows || []).map((row: any) => {
          const addTags = (args.addTags || []).filter((tag) => !(row.tags || []).some((existing: string) => existing.toLowerCase() === tag.toLowerCase()))
          const grossAmount = roundMoney(row.grossAmount)
          const fullGrossAmount = Math.abs(grossAmount)
          const budgetTargets = requestedBudgetAssignments.length
            ? requestedBudgetAssignments
            : hasBudgetChange
              ? [{ budgetId: args.budgetId ?? null, budgetName: args.budgetName ?? null, amount: null }]
              : []
          const explicitBudgetTotal = budgetTargets.reduce((sum, target) => sum + (target.amount != null ? Math.abs(Number(target.amount || 0)) : 0), 0)
          const missingBudgetAmounts = budgetTargets.filter((target) => target.amount == null).length
          let remainingBudgetAmount = Math.max(0, roundMoney(fullGrossAmount - explicitBudgetTotal))
          const newBudgets = budgetTargets.map((target, idx) => {
            const resolved = resolveBudgetTarget(target)
            let amount = target.amount != null ? Math.abs(roundMoney(target.amount)) : 0
            if (target.amount == null && missingBudgetAmounts > 0) {
              const remainingMissing = budgetTargets.slice(idx).filter((candidate) => candidate.amount == null).length
              const isLastMissing = budgetTargets.slice(idx + 1).every((later) => later.amount != null)
              amount = isLastMissing
                ? remainingBudgetAmount
                : roundMoney(remainingBudgetAmount / Math.max(1, remainingMissing))
              remainingBudgetAmount = roundMoney(remainingBudgetAmount - amount)
            }
            return {
              budgetId: resolved.budgetId,
              label: resolved.label,
              amount
            }
          })
          return {
            id: `agent-voucher-update-${row.id}`,
            voucherId: Number(row.id),
            voucherNo: row.voucherNo,
            date: row.date,
            type: row.type,
            description: row.description,
            grossAmount,
            oldBudgetId: row.budgetId ?? null,
            oldBudgetLabel: row.budgetLabel ?? null,
            ...(hasBudgetChange ? {
              newBudgetId: newBudgets[0]?.budgetId ?? budget?.id ?? args.budgetId ?? null,
              newBudgetLabel: newBudgets.length > 1
                ? `${newBudgets.length} Budgets`
                : (newBudgets[0]?.label ?? (budget ? budgetLabel(budget) : (args.budgetName || (args.budgetId ? `Budget #${args.budgetId}` : null)))),
              newBudgetAmount: newBudgets.length === 1 ? newBudgets[0]?.amount ?? fullGrossAmount : fullGrossAmount,
              newBudgets
            } : {}),
            oldEarmarkId: row.earmarkId ?? null,
            oldEarmarkLabel: row.earmarkCode ?? null,
            ...(hasEarmarkChange ? {
              newEarmarkId: earmark?.id ?? args.earmarkId ?? null,
              newEarmarkLabel: earmark?.code || earmark?.name || args.earmarkName || (args.earmarkId ? `Zweckbindung #${args.earmarkId}` : null),
              newEarmarkAmount: fullGrossAmount
            } : {}),
            oldTags: row.tags || [],
            newTags: [...(row.tags || []), ...addTags],
            noteAppend: args.noteAppend || null,
            selected: true
          }
        })
        return {
          ok: true,
          data: {
            message: `${changes.length} Buchungsänderung(en) als Review-Entwurf vorbereitet.`,
            reason: args.reason || null,
            changes
          },
          draft: {
            kind: 'voucherUpdate',
            title: args.reason || `${changes.length} Buchungsänderung(en)`,
            payload: {
              changes,
              reason: args.reason || null
            }
          }
        }
      }
    },
    {
      name: 'voucher_reverse_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um bestehende Buchungen zu stornieren. Nutze dies bei Duplikaten, Dubletten oder wenn der Nutzer ausdrücklich stornieren/löschen per Storno will. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        voucherIds: { type: 'array', items: { type: 'number' } },
        reason: nullableString
      }, ['voucherIds']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          voucherIds: z.array(z.number().int().positive()).min(1).max(25),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const voucherResult = listVouchersAdvancedPaged({
          voucherIds: args.voucherIds,
          limit: args.voucherIds.length,
          sort: 'ASC',
          sortBy: 'date'
        } as any)
        const rows = (voucherResult.rows || []) as any[]
        const found = new Set(rows.map((row) => Number(row.id)))
        const missing = args.voucherIds.filter((id) => !found.has(Number(id)))
        if (missing.length) return { ok: false, warning: `Diese Belege wurden nicht gefunden: ${missing.join(', ')}.` }
        const blocked = rows.find((row) => row.reversedById || row.originalId)
        if (blocked) {
          return {
            ok: false,
            warning: `Beleg ${blocked.voucherNo || `#${blocked.id}`} kann nicht in diesem Storno-Entwurf verwendet werden, weil er bereits storniert wurde oder selbst eine Stornobuchung ist.`
          }
        }
        const vouchers = rows.map((row) => ({
          id: Number(row.id),
          voucherNo: row.voucherNo,
          date: row.date,
          type: row.type,
          sphere: row.sphere,
          description: row.description,
          grossAmount: roundMoney(row.grossAmount),
          paymentMethod: row.paymentMethod ?? null,
          paymentAccountName: row.paymentAccountName ?? null,
          tags: row.tags || []
        }))
        return {
          ok: true,
          data: {
            message: `${vouchers.length} Storno-Review(s) vorbereitet.`,
            vouchers
          },
          draft: {
            kind: 'voucherReverse',
            title: args.reason || `${vouchers.length} Buchung(en) stornieren`,
            payload: {
              reason: args.reason || null,
              vouchers
            }
          }
        }
      }
    },
    {
      name: 'voucher_rebook_draft_prepare',
      description: 'Bereitet einen Review-Entwurf vor, um eine bestehende Buchung zu stornieren und als korrigierte neue Buchung wieder anzulegen. Nutze dies, wenn Typ, Betrag oder andere gesperrte Buchungsfelder nicht direkt bearbeitbar sind. Speichert nichts direkt.',
      readOnly: false,
      parameters: toolParameters({
        originalVoucherId: { type: 'number' },
        newType: { type: 'string', enum: ['IN', 'OUT'] },
        date: nullableString,
        sphere: { type: ['string', 'null'], enum: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB', null] },
        description: nullableString,
        grossAmount: nullableNumber,
        vatRate: nullableNumber,
        paymentMethod: { type: ['string', 'null'], enum: ['BAR', 'BANK', null] },
        paymentAccountId: nullableNumber,
        tags: { type: 'array', items: { type: 'string' } },
        bankTransactionId: nullableNumber,
        reason: nullableString
      }, ['originalVoucherId', 'newType']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          originalVoucherId: z.number().int().positive(),
          newType: z.enum(['IN', 'OUT']),
          date: z.string().nullable().optional(),
          sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']).nullable().optional(),
          description: z.string().nullable().optional(),
          grossAmount: z.number().positive().nullable().optional(),
          vatRate: z.number().min(0).max(100).nullable().optional(),
          paymentMethod: z.enum(['BAR', 'BANK']).nullable().optional(),
          paymentAccountId: z.number().nullable().optional(),
          tags: z.array(z.string()).optional(),
          bankTransactionId: z.number().nullable().optional(),
          reason: z.string().nullable().optional()
        }), rawArgs)
        const intentText = normalizeLookup(args.reason || '')
        if (
          args.bankTransactionId &&
          /(bank|bankimport|bankbeleg|banktransaktion).*(verknuepf|verknupf|zuord|link)|(?:verknuepf|verknupf|zuord|link).*(bank|bankimport|bankbeleg|banktransaktion)/.test(intentText) &&
          !/(storn|storno|korrekt|korrig|falsch|neu buch|neu anleg|ersatz|in statt out|out statt in|soll in|soll out)/.test(intentText)
        ) {
          return {
            ok: false,
            warning: 'Dieser Auftrag klingt nach reiner Bankbeleg-Verknüpfung. Nutze bank_transaction_link_draft_prepare; dafür darf keine Buchung storniert oder ersetzt werden.'
          }
        }
        const voucherResult = listVouchersAdvancedPaged({
          voucherIds: [args.originalVoucherId],
          limit: 1,
          sort: 'ASC',
          sortBy: 'date'
        } as any)
        const original = (voucherResult.rows || [])[0] as any
        if (!original) return { ok: false, warning: `Beleg #${args.originalVoucherId} wurde nicht gefunden.` }
        if (original.reversedById) return { ok: false, warning: `Beleg ${original.voucherNo || args.originalVoucherId} wurde bereits storniert.` }
        if (original.originalId) return { ok: false, warning: `Beleg ${original.voucherNo || args.originalVoucherId} ist selbst eine Stornobuchung.` }

        const paymentAccountId = Object.prototype.hasOwnProperty.call(args, 'paymentAccountId')
          ? args.paymentAccountId ?? null
          : original.paymentAccountId ?? null
        const account = paymentAccountId
          ? listPaymentAccounts({ activeOnly: true } as any).find((item: any) => Number(item.id) === Number(paymentAccountId))
          : null
        const replacementTags = args.tags?.length ? args.tags : (original.tags || [])
        const replacement = {
          date: args.date || original.date,
          type: args.newType,
          sphere: args.sphere || original.sphere,
          description: args.description || original.description || `Korrektur zu ${original.voucherNo}`,
          grossAmount: roundMoney(args.grossAmount ?? original.grossAmount),
          vatRate: args.vatRate ?? original.vatRate ?? 0,
          paymentMethod: args.paymentMethod ?? original.paymentMethod ?? (account?.kind === 'CASH' ? 'BAR' : account ? 'BANK' : null),
          paymentAccountId,
          paymentAccountName: account?.name ?? original.paymentAccountName ?? null,
          tags: replacementTags,
          note: [
            `Ersatzbuchung nach Storno von ${original.voucherNo || `#${original.id}`}.`,
            args.reason || null
          ].filter(Boolean).join('\n'),
          bankTransactionId: args.bankTransactionId ?? null,
          budgets: original.budgetId ? [{ budgetId: Number(original.budgetId), amount: Math.abs(Number(original.budgetAmount || original.grossAmount || 0)) }] : [],
          earmarks: original.earmarkId ? [{ earmarkId: Number(original.earmarkId), amount: Math.abs(Number(original.earmarkAmount || original.grossAmount || 0)) }] : []
        }
        return {
          ok: true,
          data: {
            message: `Storno-/Ersatzbuchungs-Review fuer ${original.voucherNo || args.originalVoucherId} vorbereitet.`,
            originalVoucherNo: original.voucherNo,
            newType: args.newType
          },
          draft: {
            kind: 'voucherRebook',
            title: args.reason || `${original.voucherNo || `#${original.id}`} stornieren und neu als ${args.newType} anlegen`,
            payload: {
              reason: args.reason || null,
              original: {
                id: Number(original.id),
                voucherNo: original.voucherNo,
                date: original.date,
                type: original.type,
                sphere: original.sphere,
                description: original.description,
                grossAmount: roundMoney(original.grossAmount),
                vatRate: original.vatRate ?? 0,
                paymentMethod: original.paymentMethod ?? null,
                paymentAccountId: original.paymentAccountId ?? null,
                paymentAccountName: original.paymentAccountName ?? null,
                tags: original.tags || []
              },
              replacement
            }
          }
        }
      }
    },
    {
      name: 'booking_draft_prepare',
      description: 'Bereitet einen neuen, freien Buchungsentwurf für das Buchungsmodal vor. Dieses Tool speichert keine Buchung. Nicht verwenden, wenn eine bestehende falsche Buchung storniert/korrigiert und neu angelegt werden soll; dafür immer voucher_rebook_draft_prepare nutzen.',
      readOnly: false,
      parameters: toolParameters({
        date: { type: 'string' },
        type: { type: 'string', enum: ['IN', 'OUT'] },
        sphere: { type: 'string', enum: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] },
        description: { type: 'string' },
        grossAmount: { type: 'number' },
        vatRate: { type: 'number' },
        paymentMethod: { type: ['string', 'null'], enum: ['BAR', 'BANK', null] },
        paymentAccountId: nullableNumber,
        tags: { type: 'array', items: { type: 'string' } },
        note: nullableString
      }, ['date', 'type', 'sphere', 'description', 'grossAmount']),
      run: (rawArgs) => {
        const args = parseArgs(z.object({
          date: z.string(),
          type: z.enum(['IN', 'OUT']),
          sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']),
          description: z.string(),
          grossAmount: z.number().positive(),
          vatRate: z.number().min(0).max(100).optional(),
          paymentMethod: z.enum(['BAR', 'BANK']).nullable().optional(),
          paymentAccountId: z.number().nullable().optional(),
          tags: z.array(z.string()).optional(),
          note: z.string().nullable().optional()
        }), rawArgs)
        const account = args.paymentAccountId
          ? listPaymentAccounts({ activeOnly: true } as any).find((item: any) => Number(item.id) === Number(args.paymentAccountId))
          : null
        const draft = {
          date: args.date,
          type: args.type,
          sphere: args.sphere,
          mode: 'GROSS',
          grossAmount: args.grossAmount,
          vatRate: args.vatRate ?? 0,
          description: args.description,
          note: args.note || 'Aus VereinO KI-Agent vorbereitet.',
          paymentMethod: args.paymentMethod ?? (account?.kind === 'CASH' ? 'BAR' : account ? 'BANK' : null),
          paymentAccountId: args.paymentAccountId ?? null,
          paymentAccountName: account?.name ?? null,
          tags: args.tags || []
        }
        return {
          ok: true,
          data: { message: 'Buchungsentwurf vorbereitet. Speicherung erfolgt erst im Buchungsmodal.' },
          draft: {
            kind: 'booking',
            title: args.description,
            payload: { qa: draft }
          }
        }
      }
    }
  ]
}
