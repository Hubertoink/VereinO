/**
 * Fiscal Report Generator for Tax Office (Finanzamt)
 * Generates annual financial reports with sphere separation for German non-profit organizations
 */

import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { summarizeVouchers, listVouchersAdvanced, cashBalance } from '../repositories/vouchers'
import { listBindings, bindingUsage } from '../repositories/bindings'
import { listBudgets, budgetUsage } from '../repositories/budgets'
import { getSetting } from './settings'

export interface FiscalReportOptions {
  fiscalYear: number
  from: string
  to: string
  orgName?: string
  includeBindings?: boolean
  includeVoucherList?: boolean
  includeBudgets?: boolean
}

interface SphereData {
  sphere: string
  sphereName: string
  inGross: number
  inNet: number
  inVat: number
  outGross: number
  outNet: number
  outVat: number
  saldo: number
}

/**
 * Generate fiscal year report PDF for tax office
 */
export async function generateFiscalReportPDF(options: FiscalReportOptions): Promise<{ filePath: string }> {
  const { fiscalYear, from, to, includeBindings = true, includeVoucherList = true, includeBudgets = false } = options
  const orgName = (options.orgName && options.orgName.trim()) || (getSetting<string>('org.name') || 'VereinO')

  // Create export directory
  const when = new Date()
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
  const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }
  const filePath = path.join(baseDir, `Finanzamt_${fiscalYear}_${stamp}.pdf`)

  // 1. Get opening balance (previous year end)
  const previousYearEnd = `${fiscalYear - 1}-12-31`
  let openingBalance = 0
  try {
    const bal = cashBalance({ to: previousYearEnd })
    openingBalance = (bal.BAR || 0) + (bal.BANK || 0)
  } catch {
    // If previous year data doesn't exist, opening balance is 0
    openingBalance = 0
  }

  // 2. Get overall summary for the fiscal year (used to compute movement)
  const summary = summarizeVouchers({ from, to } as any)

  // 4. Get data by sphere
  const spheres = [
    { key: 'IDEELL', name: 'Ideeller Bereich' },
    { key: 'ZWECK', name: 'Zweckbetrieb' },
    { key: 'VERMOEGEN', name: 'Vermögensverwaltung' },
    { key: 'WGB', name: 'Wirtschaftlicher Geschäftsbetrieb' }
  ]

  const sphereData: SphereData[] = spheres.map(s => {
    const data = summarizeVouchers({ from, to, sphere: s.key as any } as any)
    const inData = data.byType.find((t: any) => t.key === 'IN') || { gross: 0, net: 0, vat: 0 }
    const outData = data.byType.find((t: any) => t.key === 'OUT') || { gross: 0, net: 0, vat: 0 }
    
    return {
      sphere: s.key,
      sphereName: s.name,
      inGross: Number(inData.gross) || 0,
      inNet: Number(inData.net) || 0,
      inVat: Number(inData.vat) || 0,
      outGross: Math.abs(Number(outData.gross) || 0),
      outNet: Math.abs(Number(outData.net) || 0),
      outVat: Math.abs(Number(outData.vat) || 0),
      saldo: (Number(inData.gross) || 0) - Math.abs(Number(outData.gross) || 0)
    }
  })

  // 5. Get earmarks/bindings if requested (with proper balance calculation)
  let bindingsData: any[] = []
  if (includeBindings) {
    try {
      const bindings = listBindings()
      // Calculate opening balance (before fiscal year) for each binding
      const previousYearEndDate = `${fiscalYear - 1}-12-31`
      bindingsData = bindings.map((b: any) => {
        // Get opening balance: initial budget + movements before fiscal year
        const openingUsage = bindingUsage(b.id, { to: previousYearEndDate })
        // Opening balance = budget (initial capital) + transactions before this year
        const initialBudget = Number(b.budget) || 0
        const openingBalance = initialBudget + openingUsage.balance
        // Calculate current year usage
        const usage = bindingUsage(b.id, { from, to })
        // Closing balance = opening + year movements
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
    } catch {
      bindingsData = []
    }
  }

  // 6. Get budgets if requested
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
    } catch {
      budgetsData = []
    }
  }

  // 7. Get voucher list if requested
  let voucherRows: any[] = []
  if (includeVoucherList) {
    const vouchers = listVouchersAdvanced({ from, to, limit: 100000, sort: 'ASC' })
    voucherRows = Array.isArray(vouchers) ? vouchers : []
  }

  // Helper functions
  const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
  const euro = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
  
  const totalInGross = summary.byType.find((t: any) => t.key === 'IN')?.gross || 0
  const totalOutGross = Math.abs(summary.byType.find((t: any) => t.key === 'OUT')?.gross || 0)
  const totalInNet = summary.byType.find((t: any) => t.key === 'IN')?.net || 0
  const totalOutNet = Math.abs(summary.byType.find((t: any) => t.key === 'OUT')?.net || 0)

  // 3. Derive balances: Endbestand = Anfangsbestand + (IN - OUT)
  const yearMovement = (Number(totalInGross) || 0) - (Number(totalOutGross) || 0)
  const closingBalance = (Number(openingBalance) || 0) + yearMovement
  // All-time total balance equals end-of-year closing balance when reporting for a fiscal year
  const totalBalance = closingBalance

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <title>Jahresabschluss ${fiscalYear} - ${orgName}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
      padding: 32px 24px; 
      color: #222; 
      font-size: 11pt;
    }
    h1 { 
      margin: 0 0 8px; 
      font-size: 20pt; 
      font-weight: 700;
      border-bottom: 3px solid #2e7d32;
      padding-bottom: 8px;
    }
    h2 { 
      font-size: 14pt; 
      font-weight: 700; 
      margin: 24px 0 12px;
      color: #1976d2;
    }
    h3 { 
      font-size: 12pt; 
      font-weight: 600; 
      margin: 16px 0 8px;
    }
    .header-info { 
      color: #666; 
      font-size: 10pt; 
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .summary-box {
      background: #f5f5f5;
      border: 2px solid #2e7d32;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #ddd;
    }
    .summary-row:last-child {
      border-bottom: none;
      font-weight: 700;
      font-size: 12pt;
      padding-top: 12px;
      margin-top: 6px;
      border-top: 2px solid #333;
    }
    .summary-label { font-weight: 600; }
    .summary-value { 
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .positive { color: #2e7d32; }
    .negative { color: #c62828; }
    table { 
      border-collapse: collapse; 
      width: 100%; 
      margin: 12px 0;
      font-size: 10pt;
    }
    th, td { 
      border: 1px solid #ddd; 
      padding: 8px 10px; 
      text-align: left; 
    }
    th { 
      background: #1976d2; 
      color: white; 
      font-weight: 600;
      font-size: 10pt;
    }
    td.number { 
      text-align: right; 
      font-variant-numeric: tabular-nums;
    }
    tr.total-row {
      font-weight: 700;
      background: #f5f5f5;
    }
    tr.sphere-row:nth-child(even) {
      background: #fafafa;
    }
    .footer { 
      margin-top: 32px; 
      padding-top: 16px;
      border-top: 1px solid #ddd;
      font-size: 9pt; 
      color: #777; 
      text-align: center;
    }
    .page-break { 
      page-break-before: always; 
    }
    .nowrap { white-space: nowrap; }
    .sphere-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: 600;
    }
    .sphere-IDEELL { background: #e3f2fd; color: #1976d2; }
    .sphere-ZWECK { background: #e8f5e9; color: #2e7d32; }
    .sphere-VERMOEGEN { background: #fff3e0; color: #f57c00; }
    .sphere-WGB { background: #f3e5f5; color: #7b1fa2; }
    @media print { 
      body { padding: 16px; }
      .page-break { page-break-before: always; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Jahresabschluss für das Finanzamt</h1>
  <div class="header-info">
    <strong>${esc(orgName)}</strong><br>
    Wirtschaftsjahr: ${fiscalYear} (${from} bis ${to})<br>
    Erstellt: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>

  <div class="summary-box">
    <h2 style="margin-top: 0;">1. Vermögensübersicht</h2>
    <div class="summary-row">
      <span class="summary-label">Anfangsbestand (01.01.${fiscalYear}):</span>
      <span class="summary-value">${euro(openingBalance)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Einnahmen gesamt (Brutto):</span>
      <span class="summary-value positive">+ ${euro(totalInGross)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Ausgaben gesamt (Brutto):</span>
      <span class="summary-value negative">− ${euro(totalOutGross)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Endbestand (31.12.${fiscalYear}):</span>
      <span class="summary-value ${closingBalance >= 0 ? 'positive' : 'negative'}">${euro(closingBalance)}</span>
    </div>
  </div>

  <h2>2. Einnahmen nach Sphären</h2>
  <table>
    <thead>
      <tr>
        <th>Sphäre</th>
        <th class="number">Brutto</th>
      </tr>
    </thead>
    <tbody>
      ${sphereData.map(s => `
        <tr class="sphere-row">
          <td><span class="sphere-badge sphere-${s.sphere}">${esc(s.sphereName)}</span></td>
          <td class="number">${euro(s.inGross)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Summe Einnahmen</td>
        <td class="number">${euro(totalInGross)}</td>
      </tr>
    </tbody>
  </table>

  <h2>3. Ausgaben nach Sphären</h2>
  <table>
    <thead>
      <tr>
        <th>Sphäre</th>
        <th class="number">Brutto</th>
      </tr>
    </thead>
    <tbody>
      ${sphereData.map(s => `
        <tr class="sphere-row">
          <td><span class="sphere-badge sphere-${s.sphere}">${esc(s.sphereName)}</span></td>
          <td class="number">${euro(s.outGross)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Summe Ausgaben</td>
        <td class="number">${euro(totalOutGross)}</td>
      </tr>
    </tbody>
  </table>

  <h2>4. Saldo nach Sphären</h2>
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
        <tr class="sphere-row">
          <td><span class="sphere-badge sphere-${s.sphere}">${esc(s.sphereName)}</span></td>
          <td class="number positive">${euro(s.inGross)}</td>
          <td class="number negative">${euro(s.outGross)}</td>
          <td class="number ${s.saldo >= 0 ? 'positive' : 'negative'}">${euro(s.saldo)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Gesamt</td>
        <td class="number">${euro(totalInGross)}</td>
        <td class="number">${euro(totalOutGross)}</td>
        <td class="number ${(totalInGross - totalOutGross) >= 0 ? 'positive' : 'negative'}">${euro(totalInGross - totalOutGross)}</td>
      </tr>
    </tbody>
  </table>

  ${includeBindings && bindingsData.length > 0 ? `
  <h2>5. Zweckgebundene Mittel</h2>
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
          <td>${esc(b.name)}${b.code ? ` <span class="helper">(${esc(b.code)})</span>` : ''}</td>
          <td class="number">${euro(b.openingBalance)}</td>
          <td class="number positive">${euro(b.allocated)}</td>
          <td class="number negative">${euro(b.released)}</td>
          <td class="number ${b.closingBalance >= 0 ? 'positive' : 'negative'}">${euro(b.closingBalance)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>Summe zweckgebundene Mittel</td>
        <td class="number">${euro(bindingsData.reduce((sum, b) => sum + b.openingBalance, 0))}</td>
        <td class="number">${euro(bindingsData.reduce((sum, b) => sum + b.allocated, 0))}</td>
        <td class="number">${euro(bindingsData.reduce((sum, b) => sum + b.released, 0))}</td>
        <td class="number">${euro(bindingsData.reduce((sum, b) => sum + b.closingBalance, 0))}</td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${includeBudgets && budgetsData.length > 0 ? `
  <h2>${includeBindings && bindingsData.length > 0 ? '6' : '5'}. Budgets ${fiscalYear}</h2>
  <table>
    <thead>
      <tr>
        <th>Budget</th>
        <th>Sphäre</th>
        <th class="number">Geplant</th>
        <th class="number">Ausgegeben</th>
        <th class="number">Einnahmen</th>
        <th class="number">Verfügbar</th>
      </tr>
    </thead>
    <tbody>
      ${budgetsData.map(b => `
        <tr>
          <td>${esc(b.name)}</td>
          <td><span class="sphere-badge sphere-${b.sphere}">${esc(b.sphere)}</span></td>
          <td class="number">${euro(b.amountPlanned)}</td>
          <td class="number negative">${euro(b.spent)}</td>
          <td class="number positive">${euro(b.inflow)}</td>
          <td class="number ${b.remaining >= 0 ? 'positive' : 'negative'}">${euro(b.remaining)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="2">Summe Budgets</td>
        <td class="number">${euro(budgetsData.reduce((sum, b) => sum + b.amountPlanned, 0))}</td>
        <td class="number">${euro(budgetsData.reduce((sum, b) => sum + b.spent, 0))}</td>
        <td class="number">${euro(budgetsData.reduce((sum, b) => sum + b.inflow, 0))}</td>
        <td class="number">${euro(budgetsData.reduce((sum, b) => sum + b.remaining, 0))}</td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${includeVoucherList && voucherRows.length > 0 ? `
  <div class="page-break"></div>
  <h2>Anhang: Detaillierte Belegaufstellung</h2>
  <p style="font-size: 10pt; color: #666; margin-bottom: 12px;">
    Alle Buchungen im Wirtschaftsjahr ${fiscalYear}
  </p>
  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Beleg-Nr.</th>
        <th>Typ</th>
        <th>Sphäre</th>
        <th>Beschreibung</th>
        <th class="number">Brutto</th>
      </tr>
    </thead>
    <tbody>
      ${voucherRows.map((r: any) => `
        <tr>
          <td class="nowrap">${esc(r.date)}</td>
          <td class="nowrap">${esc(r.voucherNo)}</td>
          <td class="nowrap">${esc(r.type)}</td>
          <td><span class="sphere-badge sphere-${r.sphere}">${esc(r.sphere)}</span></td>
          <td>${esc(r.description || '—')}</td>
          <td class="number ${r.type === 'IN' ? 'positive' : 'negative'}">${euro(r.grossAmount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <p style="font-size: 10pt; color: #666; margin-top: 8px;">
    Insgesamt ${voucherRows.length} Beleg(e)
  </p>
  ` : ''}

  <div style="margin-top: 32px; padding: 16px; background: linear-gradient(135deg, #1976d2 0%, #2e7d32 100%); color: white; border-radius: 8px;">
    <h2 style="margin: 0 0 8px; color: white; font-size: 16pt;">Aktueller Vermögensstand (Gesamtsaldo)</h2>
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13pt;">
      <span>Gesamtvermögen über alle Jahre:</span>
      <strong style="font-size: 18pt; font-weight: 700;">${euro(totalBalance)}</strong>
    </div>
    <p style="font-size: 9pt; margin: 8px 0 0; opacity: 0.9;">
      Stand: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>

  <div class="footer">
    VereinO - Vereinsverwaltung<br>
    Automatisch erstellter Jahresabschluss für das Finanzamt
  </div>
</body>
</html>`

  // Render to PDF
  const win = new BrowserWindow({ 
    show: false, 
    width: 900, 
    height: 10000, // Large height to accommodate all content
    webPreferences: {
      offscreen: true
    }
  })
  
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  
  // Wait for the page to fully render (especially important for large tables)
  await new Promise<void>((resolve) => {
    win.webContents.on('did-finish-load', () => {
      // Additional delay to ensure all styles are applied
      setTimeout(resolve, 300)
    })
    // Fallback timeout in case did-finish-load already fired
    setTimeout(resolve, 1000)
  })
  
  const buff = await win.webContents.printToPDF({ 
    pageSize: 'A4', 
    printBackground: true,
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    }
  })
  
  fs.writeFileSync(filePath, buff)
  
  try { win.destroy() } catch { }

  return { filePath }
}
