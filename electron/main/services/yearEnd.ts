import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { getSetting, setSetting } from './settings'
import { createExportPath } from './exportPaths'
import {
  summarizeVouchers,
  monthlyVouchers,
  listVouchersAdvanced,
  cashBalance as getCashBalance
} from '../repositories/vouchers'
import { writeAudit } from './audit'
import { voucherStatusKind, voucherStatusText } from './voucherStatus'

const CURRENCY_FMT = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const JOURNAL_COLUMNS = [
  'Datum',
  'Nr.',
  'Typ',
  'Sphäre',
  'Beschreibung',
  'Status',
  'Zahlweg',
  'Netto',
  'MwSt',
  'Brutto',
  'Tags'
] as const

function dateRangeForYear(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function grossByType(summary: any, type: 'IN' | 'OUT') {
  return round2(Number((summary.byType as any[]).find((row: any) => row.key === type)?.gross || 0))
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: Record<number, number>) {
  for (const [column, width] of Object.entries(widths)) {
    ws.getColumn(Number(column)).width = width
  }
}

function formatCurrencyCells(row: ExcelJS.Row, columns: number[]) {
  for (const column of columns) row.getCell(column).numFmt = CURRENCY_FMT
}

export async function preview(year: number) {
  const { from, to } = dateRangeForYear(year)
  const summary = summarizeVouchers({ from, to } as any)
  const cashBalance = getCashBalance({ to })
  const inGross = grossByType(summary, 'IN')
  const outGross = grossByType(summary, 'OUT')
  const adjustedTotals = {
    ...summary.totals,
    inGross,
    outGross,
    // Show saldo for gross (Einnahmen − Ausgaben)
    gross: round2(inGross - outGross)
    // Note: net and vat remain as simple sums to preserve existing breakdown expectations
  }
  return {
    year,
    from,
    to,
    totals: adjustedTotals,
    bySphere: summary.bySphere,
    byPaymentMethod: summary.byPaymentMethod,
    byPaymentAccount: (summary as any).byPaymentAccount,
    byType: summary.byType,
    cashBalance
  }
}

function paymentAccountLabel(row: any) {
  if (row?.type === 'TRANSFER') {
    const from =
      row.transferFromAccountName ||
      (row.transferFrom === 'BAR' ? 'Bar' : row.transferFrom === 'BANK' ? 'Bank' : '')
    const to =
      row.transferToAccountName ||
      (row.transferTo === 'BAR' ? 'Bar' : row.transferTo === 'BANK' ? 'Bank' : '')
    return from && to ? `${from} -> ${to}` : 'Transfer'
  }
  return (
    row?.paymentAccountName ||
    (row?.paymentMethod === 'BAR' ? 'Bar' : row?.paymentMethod === 'BANK' ? 'Bank' : '')
  )
}

function addSummarySheet(
  wb: ExcelJS.Workbook,
  year: number,
  from: string,
  to: string,
  summary: any
) {
  const ws1 = wb.addWorksheet('Zusammenfassung')
  const orgName = (getSetting<string>('org.name') || '').trim()
  ws1.addRow([`Jahresabschluss ${year}${orgName ? ` – ${orgName}` : ''}`])
  ws1.addRow([`Zeitraum: ${from} – ${to}`])
  ws1.addRow([])
  // Totals: Einnahmen, Ausgaben, Jahresabschluss (IN - OUT)
  const totalIN = grossByType(summary, 'IN')
  const totalOUT = grossByType(summary, 'OUT')
  const jahresabschluss = totalIN - totalOUT
  ws1.addRow(['Einnahmen (Brutto)', 'Ausgaben (Brutto)', 'Jahresabschluss (Brutto)'])
  ws1.addRow([totalIN, totalOUT, jahresabschluss])
  ws1.getRow(1).font = { bold: true, size: 14 }
  // Make columns wider to avoid #### truncation and truncated headings
  setColumnWidths(ws1, { 1: 24, 2: 16, 3: 16 })
  ws1.getColumn(2).alignment = { horizontal: 'right' }
  ws1.getColumn(3).alignment = { horizontal: 'right' }
  // Currency formatting for totals row (trailing €)
  formatCurrencyCells(ws1.getRow(5), [1, 2, 3])
  // By sphere table below
  ws1.addRow([])
  ws1.addRow(['Nach Sphäre', '', ''])
  ws1.getRow(ws1.rowCount).font = { bold: true }
  ws1.addRow(['Sphäre', 'Brutto', 'Netto'])
  for (const s of summary.bySphere) {
    const r = ws1.addRow([s.key, s.gross, s.net])
    formatCurrencyCells(r, [2, 3])
  }
  // Keep sphere table readable
  ws1.getColumn(1).width = Math.max(ws1.getColumn(1).width || 0, 18)
  ws1.getColumn(2).width = Math.max(ws1.getColumn(2).width || 0, 16)
  ws1.getColumn(3).width = Math.max(ws1.getColumn(3).width || 0, 16)

  ws1.addRow([])
  ws1.addRow(['Nach Zahlungskonto', '', ''])
  ws1.getRow(ws1.rowCount).font = { bold: true }
  ws1.addRow(['Konto', 'Brutto', 'Netto'])
  const paymentAccountRows =
    Array.isArray((summary as any).byPaymentAccount) && (summary as any).byPaymentAccount.length
      ? (summary as any).byPaymentAccount
      : summary.byPaymentMethod.map((p: any) => ({
          key: p.key === 'BAR' ? 'Bar' : p.key === 'BANK' ? 'Bank' : 'Ohne Konto',
          gross: p.gross,
          net: p.net
        }))
  for (const account of paymentAccountRows) {
    const r = ws1.addRow([account.key, account.gross, account.net])
    formatCurrencyCells(r, [2, 3])
  }
}

function addJournalSheet(wb: ExcelJS.Workbook, rows: any[]) {
  const ws2 = wb.addWorksheet('Journal')
  ws2.addRow([...JOURNAL_COLUMNS])
  for (const r of rows) {
    const status = voucherStatusText(r)
    const row = ws2.addRow([
      r.date,
      r.voucherNo,
      r.type,
      r.sphere,
      r.description ?? '',
      status,
      paymentAccountLabel(r),
      Number(r.netAmount?.toFixed?.(2) ?? r.netAmount),
      Number(r.vatAmount?.toFixed?.(2) ?? r.vatAmount),
      Number(r.grossAmount?.toFixed?.(2) ?? r.grossAmount),
      (r.tags || []).join(', ')
    ])
    const kind = voucherStatusKind(r)
    if (kind === 'storno') {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F1' } }
    } else if (kind === 'storniert') {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F1' } }
      row.font = { color: { argb: 'FF555555' } }
    }
    // Currency formatting for numeric columns (trailing €)
    formatCurrencyCells(row, [8, 9, 10])
  }
  ws2.getRow(1).font = { bold: true }
  // Column widths and alignments
  setColumnWidths(ws2, {
    1: 12,
    2: 8,
    3: 10,
    4: 10,
    5: 40,
    6: 28,
    7: 12,
    8: 14,
    9: 14,
    10: 14,
    11: 20
  })
  ws2.getColumn(5).alignment = { wrapText: true }
  ws2.getColumn(6).alignment = { wrapText: true }
  ws2.getColumn(8).alignment = { horizontal: 'right' }
  ws2.getColumn(9).alignment = { horizontal: 'right' }
  ws2.getColumn(10).alignment = { horizontal: 'right' }
  // Freeze header row
  ;(ws2 as any).views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  // Add a stable AutoFilter on the header
  try {
    ;(ws2 as any).autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: JOURNAL_COLUMNS.length }
    }
  } catch {}
}

function addMonthlySheet(wb: ExcelJS.Workbook, months: any[]) {
  const ws3 = wb.addWorksheet('Monate (Brutto-Saldo)')
  ws3.addRow(['Monat', 'Saldo (IN-OUT)'])
  for (const m of months) {
    const r = ws3.addRow([m.month, Number(m.gross?.toFixed?.(2) ?? m.gross)])
    r.getCell(2).numFmt = CURRENCY_FMT
  }
  ws3.getRow(1).font = { bold: true }
  // Column widths and alignment
  ws3.getColumn(1).width = 10
  ws3.getColumn(2).width = 16
  ws3.getColumn(2).alignment = { horizontal: 'right' }
}

export async function exportPackage(year: number): Promise<{ filePath: string }> {
  const { from, to } = dateRangeForYear(year)
  const stamp = `${year}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  const filePath = createExportPath(`Jahresabschluss_${stamp}.xlsx`)

  const wb = new ExcelJS.Workbook()
  const summary = summarizeVouchers({ from, to } as any)
  addSummarySheet(wb, year, from, to, summary)
  addJournalSheet(wb, listVouchersAdvanced({ from, to, limit: 200000 }))
  addMonthlySheet(wb, monthlyVouchers({ from, to }))

  await wb.xlsx.writeFile(filePath)
  return { filePath }
}

export function closeYear(year: number): { ok: boolean; closedUntil: string } {
  const d = getDb()
  // Cumulative barrier model: closing a year locks all dates <= 31.12.year
  const closedUntil = `${year}-12-31`
  setSetting('period_lock', { closedUntil }, d)
  try {
    writeAudit(d as any, null, 'yearEnd', year, 'CLOSE', { closedUntil })
  } catch {}
  return { ok: true, closedUntil }
}

export function reopenAfter(year: number): { ok: boolean; closedUntil: string | null } {
  const d = getDb()
  const current =
    getSetting<{ closedUntil?: string | null; years?: number[] }>('period_lock', d) || {}
  let nextClosedUntil: string | null = null
  if (current.closedUntil) {
    // If the barrier equals the provided year, move it to the previous year; otherwise leave as is
    const curY = Number(String(current.closedUntil).slice(0, 4))
    if (year >= curY) {
      const prevY = curY - 1
      nextClosedUntil = prevY >= 1900 ? `${prevY}-12-31` : null
    } else {
      // Asked to reopen a year older than the barrier, keep barrier
      nextClosedUntil = current.closedUntil
    }
  } else if (Array.isArray(current.years) && current.years.length) {
    // Legacy: derive barrier from max year after removing provided year
    const remain = current.years.filter((y) => y < year)
    if (remain.length) nextClosedUntil = `${Math.max(...remain)}-12-31`
    else nextClosedUntil = null
  }
  setSetting('period_lock', { closedUntil: nextClosedUntil }, d)
  try {
    writeAudit(d as any, null, 'yearEnd', year, 'REOPEN', { closedUntil: nextClosedUntil })
  } catch {}
  return { ok: true, closedUntil: nextClosedUntil }
}

export function status(): { closedUntil: string | null } {
  const d = getDb()
  const s = getSetting<{ closedUntil?: string | null; years?: number[] }>('period_lock', d) || {}
  if (s.closedUntil) return { closedUntil: s.closedUntil }
  if (Array.isArray(s.years) && s.years.length > 0) {
    // Legacy migration path: treat max year as barrier
    const y = Math.max(...s.years)
    return { closedUntil: `${y}-12-31` }
  }
  return { closedUntil: null }
}
