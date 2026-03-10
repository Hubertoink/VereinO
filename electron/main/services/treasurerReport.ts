/**
 * Treasurer Report (Kassierbericht) Generator
 * Creates a readable PDF overview for club members / Mitgliederversammlung
 */

import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { summarizeVouchers, listVouchersAdvanced, cashBalance } from '../repositories/vouchers'
import { listBindings, bindingUsage } from '../repositories/bindings'
import { listBudgets, budgetUsage } from '../repositories/budgets'
import { listMembers } from '../repositories/members'
import { listCashChecks } from '../repositories/cashChecks'
import { summarizeInvoices } from '../repositories/invoices'
import { getSetting } from './settings'

export interface TreasurerReportOptions {
  fiscalYear: number
  from: string
  to: string
  orgName?: string
  cashBalanceDate?: string
  includeMembers?: boolean
  includeInvoices?: boolean
  includeBindings?: boolean
  includeBudgets?: boolean
  includeTagSummary?: boolean
  includeVoucherList?: boolean
  includeTags?: boolean
  voucherListFrom?: string
  voucherListTo?: string
  voucherListSort?: 'ASC' | 'DESC'
}

function esc(s: any) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
}

function euro(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
}

export async function generateTreasurerReportPDF(options: TreasurerReportOptions): Promise<{ filePath: string }> {
  const {
    fiscalYear,
    from,
    to,
    cashBalanceDate,
    includeMembers = true,
    includeInvoices = true,
    includeBindings = true,
    includeBudgets = true,
    includeTagSummary = false,
    includeVoucherList = false,
    includeTags = false,
    voucherListFrom,
    voucherListTo,
    voucherListSort = 'ASC'
  } = options

  const orgName = (options.orgName && options.orgName.trim()) || (getSetting<string>('org.name') || 'VereinO')
  const cashierName = getSetting<string>('org.cashier') || ''

  // Create export directory
  const when = new Date()
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
  const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }
  const filePath = path.join(baseDir, `Kassierbericht_${fiscalYear}_${stamp}.pdf`)
  const cashBalanceAsOf = cashBalanceDate || new Date().toISOString().slice(0, 10)

  // 1. Cash balance as of the selected cut-off date
  const currentBalance = cashBalance({ to: cashBalanceAsOf })
  const totalBalance = (currentBalance.BAR || 0) + (currentBalance.BANK || 0)

  // 2. Summary for fiscal year
  const summary = summarizeVouchers({ from, to } as any)
  const totalInGross = Number(summary.byType.find((t: any) => t.key === 'IN')?.gross || 0)
  const totalOutGross = Math.abs(Number(summary.byType.find((t: any) => t.key === 'OUT')?.gross || 0))
  const saldo = totalInGross - totalOutGross

  // 3. Sphere data for fiscal year
  const spheres = [
    { key: 'IDEELL', name: 'Ideeller Bereich', color: '#1976d2', bg: '#e3f2fd' },
    { key: 'ZWECK', name: 'Zweckbetrieb', color: '#2e7d32', bg: '#e8f5e9' },
    { key: 'VERMOEGEN', name: 'Vermögensverwaltung', color: '#f57c00', bg: '#fff3e0' },
    { key: 'WGB', name: 'Wirtschaftl. Geschäftsbetrieb', color: '#7b1fa2', bg: '#f3e5f5' }
  ]
  const sphereData = spheres.map(s => {
    const data = summarizeVouchers({ from, to, sphere: s.key as any } as any)
    const inData = data.byType.find((t: any) => t.key === 'IN') || { gross: 0 }
    const outData = data.byType.find((t: any) => t.key === 'OUT') || { gross: 0 }
    return {
      ...s,
      inGross: Number(inData.gross) || 0,
      outGross: Math.abs(Number(outData.gross) || 0),
      saldo: (Number(inData.gross) || 0) - Math.abs(Number(outData.gross) || 0)
    }
  }).filter(s => s.inGross !== 0 || s.outGross !== 0)

  // 4. Last cash check
  let lastCashCheck: any = null
  try {
    const checks = listCashChecks({ year: fiscalYear })
    if (checks.rows.length > 0) {
      lastCashCheck = checks.rows[0] // already sorted DESC by date
    }
    // If no check in fiscal year, try previous year
    if (!lastCashCheck) {
      const prevChecks = listCashChecks({ year: fiscalYear - 1 })
      if (prevChecks.rows.length > 0) {
        lastCashCheck = prevChecks.rows[0]
      }
    }
  } catch { }

  // 5. Members stats (only if requested)
  let memberStats: { total: number; active: number; new: number; paused: number; left: number } | null = null
  if (includeMembers) {
    try {
      const all = listMembers({ limit: 1, offset: 0 })
      const active = listMembers({ limit: 1, offset: 0, status: 'ACTIVE' })
      const newM = listMembers({ limit: 1, offset: 0, status: 'NEW' })
      const paused = listMembers({ limit: 1, offset: 0, status: 'PAUSED' })
      const left = listMembers({ limit: 1, offset: 0, status: 'LEFT' })
      const stats = {
        total: all.total || 0,
        active: active.total || 0,
        new: newM.total || 0,
        paused: paused.total || 0,
        left: left.total || 0
      }
      // Only include if there are any members
      if (stats.total > 0) memberStats = stats
    } catch { }
  }

  // 6. Open invoices (only if requested)
  let invoiceData: { openCount: number; openAmount: number; overdueCount: number; overdueAmount: number } | null = null
  if (includeInvoices) {
    try {
      const todayIso = new Date().toISOString().slice(0, 10)
      const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()
      const sOpen = summarizeInvoices({ status: 'OPEN' } as any) as any
      const sPart = summarizeInvoices({ status: 'PARTIAL' } as any) as any
      const openCount = (sOpen?.count || 0) + (sPart?.count || 0)
      const openAmount = (sOpen?.remaining || 0) + (sPart?.remaining || 0)
      const sOverOpen = summarizeInvoices({ status: 'OPEN', dueTo: yesterday } as any) as any
      const sOverPart = summarizeInvoices({ status: 'PARTIAL', dueTo: yesterday } as any) as any
      const overdueCount = (sOverOpen?.count || 0) + (sOverPart?.count || 0)
      const overdueAmount = (sOverOpen?.remaining || 0) + (sOverPart?.remaining || 0)
      // Only include if there are open invoices
      if (openCount > 0) {
        invoiceData = { openCount, openAmount, overdueCount, overdueAmount }
      }
    } catch { }
  }

  // 7. Bindings (earmarks)
  let bindingsData: any[] = []
  if (includeBindings) {
    try {
      const bindings = listBindings()
      const todayIso = new Date().toISOString().slice(0, 10)
      const previousYearEnd = `${fiscalYear - 1}-12-31`
      bindingsData = bindings
        .filter((b: any) => {
          const ed = b.endDate ? String(b.endDate) : null
          return !ed || ed >= todayIso
        })
        .map((b: any) => {
          const openingUsage = bindingUsage(b.id, { to: previousYearEnd })
          const initialBudget = Number(b.budget) || 0
          const openingBalance = initialBudget + openingUsage.balance
          const usage = bindingUsage(b.id, { from, to })
          const closingBalance = openingBalance + usage.balance
          return {
            name: b.name,
            code: b.code,
            openingBalance,
            allocated: usage.allocated,
            released: usage.released,
            closingBalance
          }
        })
      // Only include if there are active bindings
      if (bindingsData.length === 0) bindingsData = []
    } catch {
      bindingsData = []
    }
  }

  // 8. Budgets
  let budgetsData: any[] = []
  if (includeBudgets) {
    try {
      const budgets = listBudgets({ year: fiscalYear })
      budgetsData = budgets.map((b: any) => {
        const usage = budgetUsage({ budgetId: b.id, from, to })
        return {
          name: b.name || b.categoryName || b.projectName || `Budget ${b.id}`,
          sphere: b.sphere,
          amountPlanned: Number(b.amountPlanned) || 0,
          spent: Number(usage.spent) || 0,
          inflow: Number(usage.inflow) || 0,
          remaining: (Number(b.amountPlanned) || 0) - (Number(usage.spent) || 0) + (Number(usage.inflow) || 0)
        }
      })
      if (budgetsData.length === 0) budgetsData = []
    } catch {
      budgetsData = []
    }
  }

  // 9. Tag summary (optional)
  let tagSummaryData: { tag: string; inGross: number; outGross: number; saldo: number }[] = []
  if (includeTagSummary) {
    try {
      const allVouchers = listVouchersAdvanced({ from, to, limit: 100000, sort: 'ASC' })
      const tagMap = new Map<string, { inGross: number; outGross: number }>()
      for (const v of allVouchers) {
        const tags = Array.isArray(v.tags) && v.tags.length > 0 ? v.tags : ['Ohne Tag']
        for (const tag of tags) {
          const entry = tagMap.get(tag) || { inGross: 0, outGross: 0 }
          if (v.type === 'IN') {
            entry.inGross += Math.abs(Number(v.grossAmount) || 0)
          } else if (v.type === 'OUT') {
            entry.outGross += Math.abs(Number(v.grossAmount) || 0)
          }
          tagMap.set(tag, entry)
        }
      }
      tagSummaryData = Array.from(tagMap.entries())
        .map(([tag, data]) => ({
          tag,
          inGross: data.inGross,
          outGross: data.outGross,
          saldo: data.inGross - data.outGross
        }))
        .sort((a, b) => a.tag.localeCompare(b.tag, 'de'))
    } catch {
      tagSummaryData = []
    }
  }

  // 10. Voucher list (optional)
  let voucherRows: any[] = []
  if (includeVoucherList) {
    const vlFrom = voucherListFrom || from
    const vlTo = voucherListTo || to
    const vouchers = listVouchersAdvanced({ from: vlFrom, to: vlTo, limit: 100000, sort: voucherListSort || 'ASC' })
    voucherRows = Array.isArray(vouchers) ? vouchers : []
  }

  // Determine the formatted date range
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}.${m}.${y}`
  }

  // Build section numbering dynamically
  let sectionNum = 0
  const nextSection = () => ++sectionNum

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <title>Kassierbericht ${fiscalYear} – ${esc(orgName)}</title>
  <style>
    * { box-sizing: border-box; }
    @page {
      margin: 14mm 12mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      padding: 0;
      margin: 0;
      color: #222;
      font-size: 11pt;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 22pt;
      font-weight: 700;
    }
    h2 {
      font-size: 13pt;
      font-weight: 700;
      margin: 28px 0 10px;
      color: #1565c0;
      border-bottom: 2px solid #1565c0;
      padding-bottom: 4px;
    }
    .sub { color: #555; font-size: 10pt; margin-bottom: 20px; line-height: 1.6; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 16px 0;
    }
    .kpi-box {
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 14px 16px;
      text-align: center;
    }
    .kpi-label { font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .kpi-value { font-size: 16pt; font-weight: 700; font-variant-numeric: tabular-nums; }
    .kpi-big { font-size: 20pt; }
    .positive { color: #2e7d32; }
    .negative { color: #c62828; }
    .neutral { color: #1565c0; }
    .warn { color: #e65100; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 10px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 7px 10px;
      text-align: left;
    }
    th {
      background: #1565c0;
      color: white;
      font-weight: 600;
      font-size: 9.5pt;
    }
    td.number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    tr.total-row {
      font-weight: 700;
      background: #f0f4f8;
    }
    .sphere-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: 600;
    }
    .check-box {
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 14px 18px;
      margin: 10px 0;
    }
    .check-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #eee;
    }
    .check-row:last-child { border-bottom: none; }
    .check-label { font-weight: 500; }
    .check-val { font-variant-numeric: tabular-nums; font-weight: 600; }
    .ok { color: #2e7d32; }
    .bad { color: #c62828; }
    .footer {
      margin-top: 36px;
      padding-top: 14px;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #888;
      text-align: center;
    }
    .page-break { page-break-before: always; }
    .sig-grid { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sig-line { border-top: 1px solid #333; padding-top: 6px; font-size: 10pt; text-align: center; }
    .member-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin: 12px 0;
    }
    .member-box {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .member-label { font-size: 9pt; color: #666; }
    .member-value { font-size: 14pt; font-weight: 700; }
    .invoice-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 12px 0;
    }
    .nowrap { white-space: nowrap; }
    /* Prevent sections from being cut at page breaks */
    h2 {
      page-break-after: avoid;
      break-after: avoid;
    }
    .kpi-grid, .kpi-box, .check-box, .member-grid, .invoice-grid {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table {
      page-break-inside: auto;
      break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-block {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-grid {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      .page-break { page-break-before: always; }
      h2 { page-break-after: avoid; break-after: avoid; }
      .kpi-grid, .check-box, .member-grid, .invoice-grid, .section-block, .sig-grid {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Kassierbericht</h1>
  <div class="sub">
    <strong>${esc(orgName)}</strong><br>
    Berichtszeitraum: ${fmtDate(from)} – ${fmtDate(to)} (Geschäftsjahr ${fiscalYear})<br>
    Kassenstand zum Stichtag: ${fmtDate(cashBalanceAsOf)}<br>
    ${cashierName ? `Kassier: ${esc(cashierName)}<br>` : ''}
    Erstellt am ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>

  <div class="section-block">
  <!-- 1. Kassenstand zum Stichtag -->
  <h2>${nextSection()}. Kassenstand zum ${fmtDate(cashBalanceAsOf)}</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">💵 Bargeld (Bar)</div>
      <div class="kpi-value neutral">${esc(euro(currentBalance.BAR || 0))}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">🏦 Bankkonto</div>
      <div class="kpi-value neutral">${esc(euro(currentBalance.BANK || 0))}</div>
    </div>
    <div class="kpi-box" style="border-color: #1565c0; border-width: 2px;">
      <div class="kpi-label">Gesamt</div>
      <div class="kpi-value kpi-big ${totalBalance >= 0 ? 'positive' : 'negative'}">${esc(euro(totalBalance))}</div>
    </div>
  </div>
  </div>

  <div class="section-block">
  <!-- 2. Einnahmen / Ausgaben -->
  <h2>${nextSection()}. Einnahmen & Ausgaben (${fiscalYear})</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Einnahmen</div>
      <div class="kpi-value positive">${esc(euro(totalInGross))}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Ausgaben</div>
      <div class="kpi-value negative">${esc(euro(totalOutGross))}</div>
    </div>
    <div class="kpi-box" style="border-color: ${saldo >= 0 ? '#2e7d32' : '#c62828'}; border-width: 2px;">
      <div class="kpi-label">Saldo</div>
      <div class="kpi-value kpi-big ${saldo >= 0 ? 'positive' : 'negative'}">${esc(euro(saldo))}</div>
    </div>
  </div>
  </div>

  ${lastCashCheck ? `
  <div class="section-block">
  <!-- Letzte Kassenprüfung -->
  <h2>${nextSection()}. Letzte Kassenprüfung</h2>
  <div class="check-box">
    <div class="check-row">
      <div class="check-label">Datum / Stichtag</div>
      <div class="check-val">${esc(fmtDate(lastCashCheck.date))} (Jahr ${lastCashCheck.year})</div>
    </div>
    <div class="check-row">
      <div class="check-label">Soll-Bestand (Bar)</div>
      <div class="check-val">${esc(euro(lastCashCheck.soll))}</div>
    </div>
    <div class="check-row">
      <div class="check-label">Ist-Bestand (gezählt)</div>
      <div class="check-val">${esc(euro(lastCashCheck.ist))}</div>
    </div>
    <div class="check-row">
      <div class="check-label">Differenz (Ist − Soll)</div>
      <div class="check-val ${lastCashCheck.diff === 0 ? 'ok' : (lastCashCheck.diff > 0 ? 'ok' : 'bad')}">${esc(euro(lastCashCheck.diff))} ${lastCashCheck.diff === 0 ? '✓ Keine Differenz' : ''}</div>
    </div>
    <div class="check-row">
      <div class="check-label">Prüfer</div>
      <div class="check-val">${esc([lastCashCheck.inspector1Name, lastCashCheck.inspector2Name].filter(Boolean).join(' · ') || '—')}</div>
    </div>
    ${lastCashCheck.note ? `<div class="check-row"><div class="check-label">Notiz</div><div class="check-val" style="font-weight:400">${esc(lastCashCheck.note)}</div></div>` : ''}
  </div>
  </div>
  ` : ''}

  ${sphereData.length > 0 ? `
  <div class="section-block">
  <!-- Sphären-Übersicht -->
  <h2>${nextSection()}. Aufteilung nach Sphären (${fiscalYear})</h2>
  <table>
    <thead>
      <tr>
        <th>Sphäre</th>
        <th class="number">Einnahmen</th>
        <th class="number">Ausgaben</th>
        <th class="number">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${sphereData.map(s => `
        <tr>
          <td><span class="sphere-badge" style="background:${s.bg};color:${s.color}">${esc(s.name)}</span></td>
          <td class="number positive">${euro(s.inGross)}</td>
          <td class="number negative">${euro(s.outGross)}</td>
          <td class="number ${s.saldo >= 0 ? 'positive' : 'negative'}">${euro(s.saldo)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Gesamt</td>
        <td class="number">${euro(totalInGross)}</td>
        <td class="number">${euro(totalOutGross)}</td>
        <td class="number ${saldo >= 0 ? 'positive' : 'negative'}">${euro(saldo)}</td>
      </tr>
    </tbody>
  </table>
  </div>
  ` : ''}

  ${memberStats ? `
  <div class="section-block">
  <!-- Mitglieder -->
  <h2>${nextSection()}. Mitglieder</h2>
  <div class="member-grid">
    <div class="member-box">
      <div class="member-label">Gesamt</div>
      <div class="member-value">${memberStats.total}</div>
    </div>
    <div class="member-box" style="border-color: #2e7d32;">
      <div class="member-label">Aktiv</div>
      <div class="member-value positive">${memberStats.active}</div>
    </div>
    <div class="member-box">
      <div class="member-label">Neu</div>
      <div class="member-value">${memberStats.new}</div>
    </div>
    <div class="member-box">
      <div class="member-label">Pausiert</div>
      <div class="member-value warn">${memberStats.paused}</div>
    </div>
    <div class="member-box">
      <div class="member-label">Ausgetreten</div>
      <div class="member-value">${memberStats.left}</div>
    </div>
  </div>
  </div>
  ` : ''}

  ${invoiceData ? `
  <div class="section-block">
  <!-- Offene Verbindlichkeiten -->
  <h2>${nextSection()}. Offene Verbindlichkeiten</h2>
  <div class="invoice-grid">
    <div class="kpi-box">
      <div class="kpi-label">Offen gesamt</div>
      <div class="kpi-value warn">${esc(euro(invoiceData.openAmount))}</div>
      <div class="kpi-label" style="margin-top:4px">${invoiceData.openCount} Rechnung(en)</div>
    </div>
    <div class="kpi-box" style="border-color: ${invoiceData.overdueCount > 0 ? '#c62828' : '#ddd'};">
      <div class="kpi-label">Davon überfällig</div>
      <div class="kpi-value ${invoiceData.overdueCount > 0 ? 'negative' : ''}">${esc(euro(invoiceData.overdueAmount))}</div>
      <div class="kpi-label" style="margin-top:4px">${invoiceData.overdueCount} Rechnung(en)</div>
    </div>
  </div>
  </div>
  ` : ''}

  ${bindingsData.length > 0 ? `
  <div class="section-block">
  <!-- Zweckbindungen -->
  <h2>${nextSection()}. Aktive Zweckbindungen</h2>
  <table>
    <thead>
      <tr>
        <th>Zweckbindung</th>
        <th class="number">Anfangsbestand</th>
        <th class="number">Zufluss</th>
        <th class="number">Abfluss</th>
        <th class="number">Endbestand</th>
      </tr>
    </thead>
    <tbody>
      ${bindingsData.map(b => `
        <tr>
          <td>${esc(b.name)}${b.code ? ` <span style="color:#888;font-size:9pt">(${esc(b.code)})</span>` : ''}</td>
          <td class="number">${euro(b.openingBalance)}</td>
          <td class="number positive">${euro(b.allocated)}</td>
          <td class="number negative">${euro(b.released)}</td>
          <td class="number ${b.closingBalance >= 0 ? 'positive' : 'negative'}">${euro(b.closingBalance)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Summe</td>
        <td class="number">${euro(bindingsData.reduce((s: number, b: any) => s + b.openingBalance, 0))}</td>
        <td class="number">${euro(bindingsData.reduce((s: number, b: any) => s + b.allocated, 0))}</td>
        <td class="number">${euro(bindingsData.reduce((s: number, b: any) => s + b.released, 0))}</td>
        <td class="number">${euro(bindingsData.reduce((s: number, b: any) => s + b.closingBalance, 0))}</td>
      </tr>
    </tbody>
  </table>
  </div>
  ` : ''}

  ${budgetsData.length > 0 ? `
  <div class="section-block">
  <!-- Budgets -->
  <h2>${nextSection()}. Budgets (${fiscalYear})</h2>
  <table>
    <thead>
      <tr>
        <th>Budget</th>
        <th>Sphäre</th>
        <th class="number">Geplant</th>
        <th class="number">Ausgegeben</th>
        <th class="number">Verfügbar</th>
      </tr>
    </thead>
    <tbody>
      ${budgetsData.map(b => `
        <tr>
          <td>${esc(b.name)}</td>
          <td><span class="sphere-badge" style="background:${spheres.find(s=>s.key===b.sphere)?.bg||'#eee'};color:${spheres.find(s=>s.key===b.sphere)?.color||'#333'}">${esc(b.sphere)}</span></td>
          <td class="number">${euro(b.amountPlanned)}</td>
          <td class="number negative">${euro(b.spent)}</td>
          <td class="number ${b.remaining >= 0 ? 'positive' : 'negative'}">${euro(b.remaining)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="2">Summe</td>
        <td class="number">${euro(budgetsData.reduce((s: number, b: any) => s + b.amountPlanned, 0))}</td>
        <td class="number">${euro(budgetsData.reduce((s: number, b: any) => s + b.spent, 0))}</td>
        <td class="number">${euro(budgetsData.reduce((s: number, b: any) => s + b.remaining, 0))}</td>
      </tr>
    </tbody>
  </table>
  </div>
  ` : ''}

  ${tagSummaryData.length > 0 ? `
  <div class="section-block">
  <h2>${nextSection()}. Auswertung nach Tags (${fiscalYear})</h2>
  <table>
    <thead>
      <tr>
        <th>Tag</th>
        <th class="number">Einnahmen</th>
        <th class="number">Ausgaben</th>
        <th class="number">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${tagSummaryData.map(t => `
        <tr${t.tag === 'Ohne Tag' ? ' style="color:#888;font-style:italic"' : ''}>
          <td>${t.tag === 'Ohne Tag' ? '<em>' + esc(t.tag) + '</em>' : '🏷️ ' + esc(t.tag)}</td>
          <td class="number positive">${euro(t.inGross)}</td>
          <td class="number negative">${euro(t.outGross)}</td>
          <td class="number ${t.saldo >= 0 ? 'positive' : 'negative'}">${euro(t.saldo)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Gesamt</td>
        <td class="number">${euro(tagSummaryData.reduce((s, t) => s + t.inGross, 0))}</td>
        <td class="number">${euro(tagSummaryData.reduce((s, t) => s + t.outGross, 0))}</td>
        <td class="number ${tagSummaryData.reduce((s, t) => s + t.saldo, 0) >= 0 ? 'positive' : 'negative'}">${euro(tagSummaryData.reduce((s, t) => s + t.saldo, 0))}</td>
      </tr>
    </tbody>
  </table>
  </div>
  ` : ''}

  ${includeVoucherList && voucherRows.length > 0 ? `
  <div class="page-break"></div>
  <h2>Anhang: Einzelbuchungen${voucherListFrom || voucherListTo ? ` (${voucherListFrom ? fmtDate(voucherListFrom) : '…'} – ${voucherListTo ? fmtDate(voucherListTo) : '…'})` : ` (${fmtDate(from)} – ${fmtDate(to)})`}</h2>
  <p style="font-size:10pt;color:#666;margin-bottom:10px">
    ${voucherRows.length} Buchung(en), sortiert ${voucherListSort === 'ASC' ? 'aufsteigend' : 'absteigend'} nach Datum
  </p>
  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Beleg-Nr.</th>
        <th>Typ</th>
        <th>Sphäre</th>
        <th>Beschreibung</th>
        <th>Zahlweg</th>
        <th class="number">Brutto</th>
        ${includeTags ? '<th>Tags</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${voucherRows.map((r: any) => `
        <tr>
          <td class="nowrap">${esc(r.date)}</td>
          <td class="nowrap">${esc(r.voucherNo)}</td>
          <td class="nowrap">${r.type === 'IN' ? '↓ E' : r.type === 'OUT' ? '↑ A' : '⇄ U'}</td>
          <td><span class="sphere-badge" style="background:${spheres.find(s=>s.key===r.sphere)?.bg||'#eee'};color:${spheres.find(s=>s.key===r.sphere)?.color||'#333'}">${esc(r.sphere || '—')}</span></td>
          <td>${esc(r.description || '—')}</td>
          <td class="nowrap">${r.paymentMethod === 'BAR' ? '💵 Bar' : r.paymentMethod === 'BANK' ? '🏦 Bank' : '—'}</td>
          <td class="number ${r.type === 'IN' ? 'positive' : 'negative'}">${euro(r.grossAmount)}</td>
          ${includeTags ? `<td>${Array.isArray(r.tags) && r.tags.length ? r.tags.map((t: string) => esc(t)).join(', ') : '—'}</td>` : ''}
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <!-- Signature -->
  <div class="sig-grid">
    <div>
      <div style="height:40px"></div>
      <div class="sig-line">Ort, Datum</div>
    </div>
    <div>
      <div style="height:40px"></div>
      <div class="sig-line">Unterschrift Kassier${cashierName ? ` (${esc(cashierName)})` : ''}</div>
    </div>
  </div>

  <div class="footer">
    ${esc(orgName)} · Kassierbericht ${fiscalYear} · VereinO Vereinsverwaltung
  </div>
</body>
</html>`

  // Render to PDF
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 10000,
    webPreferences: { offscreen: true }
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

  await new Promise<void>((resolve) => {
    win.webContents.on('did-finish-load', () => {
      setTimeout(resolve, 300)
    })
    setTimeout(resolve, 1000)
  })

  const buff = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  })

  fs.writeFileSync(filePath, buff)
  try { win.destroy() } catch { }

  return { filePath }
}
