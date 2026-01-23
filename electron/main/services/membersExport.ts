/**
 * Members Export Service
 * Generates Excel (XLSX) and PDF exports of member data
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { BrowserWindow } from 'electron'
import { listMembers, MemberRow, MemberStatus } from '../repositories/members'
import { getSetting } from './settings'

// We use ExcelJS for XLSX export - already a dependency
import ExcelJS from 'exceljs'

export type MemberExportField = 
  | 'memberNo' 
  | 'name' 
  | 'email' 
  | 'phone' 
  | 'address' 
  | 'status' 
  | 'boardRole' 
  | 'iban' 
  | 'bic' 
  | 'contribution_amount' 
  | 'contribution_interval' 
  | 'mandate_ref' 
  | 'mandate_date' 
  | 'join_date' 
  | 'leave_date' 
  | 'notes'

export interface MembersExportOptions {
  format: 'XLSX' | 'PDF'
  status?: MemberStatus | 'ALL'
  q?: string
  fields: MemberExportField[]
  sortBy?: 'memberNo' | 'name'
  sortDir?: 'ASC' | 'DESC'
}

// Field metadata for export
const FIELD_META: Record<MemberExportField, { label: string; width: number }> = {
  memberNo: { label: 'Mitglieds-Nr.', width: 15 },
  name: { label: 'Name', width: 25 },
  email: { label: 'E-Mail', width: 30 },
  phone: { label: 'Telefon', width: 18 },
  address: { label: 'Adresse', width: 40 },
  status: { label: 'Status', width: 12 },
  boardRole: { label: 'Vorstandsfunktion', width: 18 },
  join_date: { label: 'Eintritt', width: 12 },
  leave_date: { label: 'Austritt', width: 12 },
  iban: { label: 'IBAN', width: 28 },
  bic: { label: 'BIC', width: 14 },
  contribution_amount: { label: 'Beitrag (€)', width: 12 },
  contribution_interval: { label: 'Intervall', width: 12 },
  mandate_ref: { label: 'Mandats-Ref.', width: 16 },
  mandate_date: { label: 'Mandats-Datum', width: 14 },
  notes: { label: 'Anmerkungen', width: 40 }
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktiv',
  NEW: 'Neu',
  PAUSED: 'Pausiert',
  LEFT: 'Ausgetreten'
}

const BOARD_ROLE_LABELS: Record<string, string> = {
  V1: '1. Vorsitz',
  V2: '2. Vorsitz',
  KASSIER: 'Kassier',
  KASSENPR1: '1. Kassenprüfer',
  KASSENPR2: '2. Kassenprüfer',
  SCHRIFT: 'Schriftführer'
}

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartal',
  YEARLY: 'Jährlich'
}

/**
 * Load all members matching the filter criteria
 */
function loadMembersForExport(options: MembersExportOptions): MemberRow[] {
  const { status, q, sortBy = 'memberNo', sortDir = 'ASC' } = options
  
  // Load all members (no pagination for export)
  const PAGE_SIZE = 500
  const allMembers: MemberRow[] = []
  let offset = 0
  let total = 0
  
  do {
    const result = listMembers({
      q: q || undefined,
      status: status === 'ALL' ? undefined : status,
      limit: PAGE_SIZE,
      offset,
      sortBy,
      sort: sortDir
    })
    allMembers.push(...result.rows)
    total = result.total
    offset += PAGE_SIZE
  } while (offset < total)
  
  return allMembers
}

/**
 * Format a field value for display
 */
function formatFieldValue(member: MemberRow, field: MemberExportField): string {
  const value = (member as any)[field]
  
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  
  switch (field) {
    case 'status':
      return STATUS_LABELS[value] || value
    case 'boardRole':
      return BOARD_ROLE_LABELS[value] || value
    case 'contribution_interval':
      return INTERVAL_LABELS[value] || value
    case 'contribution_amount':
      return typeof value === 'number' 
        ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
        : value
    case 'join_date':
    case 'leave_date':
    case 'mandate_date':
      // Format date to German locale
      try {
        const d = new Date(value)
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('de-DE')
        }
      } catch {}
      return value
    default:
      return String(value)
  }
}

/**
 * Create export directory and return file path
 */
function prepareExportPath(format: 'XLSX' | 'PDF'): string {
  const when = new Date()
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
  const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  
  try { 
    fs.mkdirSync(baseDir, { recursive: true }) 
  } catch { }
  
  const ext = format === 'XLSX' ? 'xlsx' : 'pdf'
  return path.join(baseDir, `Mitglieder_${stamp}.${ext}`)
}

/**
 * Export members to Excel (XLSX) format
 */
export async function exportMembersXLSX(options: MembersExportOptions): Promise<{ filePath: string; count: number }> {
  const members = loadMembersForExport(options)
  const filePath = prepareExportPath('XLSX')
  const orgName = getSetting<string>('org.name') || 'VereinO'
  
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VereinO'
  workbook.created = new Date()
  
  const sheet = workbook.addWorksheet('Mitglieder', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
  })
  
  // Title row
  const titleRow = sheet.getRow(1)
  titleRow.getCell(1).value = `${orgName} – Mitgliederliste (${members.length} Mitglieder)`
  titleRow.getCell(1).font = { bold: true, size: 14 }
  titleRow.height = 24
  
  // Merge title cells across all columns
  if (options.fields.length > 1) {
    sheet.mergeCells(1, 1, 1, options.fields.length)
  }
  
  // Header row
  const headerRow = sheet.getRow(2)
  options.fields.forEach((field, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = FIELD_META[field].label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF26A69A' } // Teal color matching the app
    }
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } }
    }
  })
  headerRow.height = 22
  
  // Set column widths
  options.fields.forEach((field, idx) => {
    sheet.getColumn(idx + 1).width = FIELD_META[field].width
  })
  
  // Data rows
  members.forEach((member, rowIdx) => {
    const row = sheet.getRow(rowIdx + 3)
    options.fields.forEach((field, colIdx) => {
      const cell = row.getCell(colIdx + 1)
      const rawValue = (member as any)[field]
      
      // Use raw values for Excel, not formatted strings (for numbers/dates)
      if (field === 'contribution_amount' && typeof rawValue === 'number') {
        cell.value = rawValue
        cell.numFmt = '#,##0.00 €'
      } else if ((field === 'join_date' || field === 'leave_date' || field === 'mandate_date') && rawValue) {
        try {
          const d = new Date(rawValue)
          if (!isNaN(d.getTime())) {
            cell.value = d
            cell.numFmt = 'DD.MM.YYYY'
          } else {
            cell.value = rawValue || '—'
          }
        } catch {
          cell.value = rawValue || '—'
        }
      } else {
        cell.value = formatFieldValue(member, field)
      }
      
      cell.alignment = { vertical: 'middle' }
      
      // Alternate row background
      if (rowIdx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' }
        }
      }
    })
    row.height = 18
  })
  
  // Add filter
  if (members.length > 0) {
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: members.length + 2, column: options.fields.length }
    }
  }
  
  // Summary row
  const summaryRow = sheet.getRow(members.length + 4)
  summaryRow.getCell(1).value = `Export: ${new Date().toLocaleString('de-DE')}`
  summaryRow.getCell(1).font = { italic: true, size: 10 }
  
  await workbook.xlsx.writeFile(filePath)
  
  return { filePath, count: members.length }
}

/**
 * Export members to PDF format using Electron's print-to-PDF
 */
export async function exportMembersPDF(options: MembersExportOptions): Promise<{ filePath: string; count: number }> {
  const members = loadMembersForExport(options)
  const filePath = prepareExportPath('PDF')
  const orgName = getSetting<string>('org.name') || 'VereinO'
  
  // Build HTML content
  const statusFilterLabel = options.status === 'ALL' ? 'Alle' : STATUS_LABELS[options.status || 'ALL'] || options.status
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Arial, sans-serif; 
      font-size: 10px; 
      margin: 20px;
      color: #333;
    }
    h1 { 
      font-size: 16px; 
      margin: 0 0 4px 0;
      color: #26A69A;
    }
    .subtitle {
      font-size: 11px;
      color: #666;
      margin-bottom: 12px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse;
      margin-top: 8px;
    }
    th { 
      background: #26A69A; 
      color: white; 
      padding: 6px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    td { 
      padding: 5px 8px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 9px;
    }
    tr:nth-child(even) { 
      background: #f9f9f9; 
    }
    .footer {
      margin-top: 16px;
      font-size: 9px;
      color: #888;
      text-align: right;
    }
    .status-active { color: #00C853; font-weight: 500; }
    .status-new { color: #2196F3; font-weight: 500; }
    .status-paused { color: #FF9800; font-weight: 500; }
    .status-left { color: #f44336; font-weight: 500; }
    .count-badge {
      display: inline-block;
      background: #26A69A;
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(orgName)} – Mitgliederliste <span class="count-badge">${members.length}</span></h1>
  <div class="subtitle">Filter: ${escapeHtml(statusFilterLabel)}${options.q ? ` | Suche: "${escapeHtml(options.q)}"` : ''}</div>
  
  <table>
    <thead>
      <tr>
        ${options.fields.map(f => `<th>${escapeHtml(FIELD_META[f].label)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${members.map(member => `
        <tr>
          ${options.fields.map(f => {
            const value = formatFieldValue(member, f)
            let className = ''
            if (f === 'status') {
              const status = (member as any).status?.toUpperCase()
              className = `status-${status?.toLowerCase() || ''}`
            }
            return `<td class="${className}">${escapeHtml(value)}</td>`
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <div class="footer">
    Export: ${new Date().toLocaleString('de-DE')} | VereinO
  </div>
</body>
</html>
`

  // Create a hidden browser window to render and print the PDF
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    
    // Wait a bit for rendering
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const pdfData = await win.webContents.printToPDF({
      landscape: options.fields.length > 6, // Landscape for many columns
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5
      }
    })
    
    fs.writeFileSync(filePath, pdfData)
    
    return { filePath, count: members.length }
  } finally {
    win.destroy()
  }
}

/**
 * Main export function
 */
export async function exportMembers(options: MembersExportOptions): Promise<{ filePath: string; count: number }> {
  if (options.format === 'PDF') {
    return exportMembersPDF(options)
  } else {
    return exportMembersXLSX(options)
  }
}

/**
 * Helper: Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
