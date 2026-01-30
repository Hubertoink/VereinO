import ExcelJS from 'exceljs'
import { Buffer as NodeBuffer } from 'node:buffer'
import { dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { createMember, listMembers } from '../repositories/members'
import { getDb, withTransaction } from '../db/database'
import { writeAudit } from './audit'

// ============================================================================
// Types
// ============================================================================

export type MembersImportPreview = {
  headers: string[]
  sample: any[]
  suggestedMapping: Record<string, string | null>
  headerRowIndex: number
}

export type MembersImportExecuteResult = {
  imported: number
  skipped: number
  updated: number
  errors: Array<{ row: number; message: string }>
  rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>
  errorFilePath?: string
}

const MEMBER_FIELD_KEYS = [
  'memberNo', 'name', 'email', 'phone', 'address', 'status',
  'iban', 'bic', 'contribution_amount', 'contribution_interval',
  'mandate_ref', 'mandate_date', 'join_date', 'leave_date', 'notes',
  'firstName', 'lastName', // alternative to 'name'
  'street', 'zip', 'city', // alternative to 'address'
] as const

export type MemberFieldKey = typeof MEMBER_FIELD_KEYS[number]

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeHeader(h: string): string {
  return (h || '').toString().trim().toLowerCase()
}

function normalizeCellValue(v: any): any {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('result' in v) return normalizeCellValue(v.result)
    if ('richText' in v) return (v.richText as any[]).map((r: any) => r?.text ?? '').join('')
    if ('text' in v) return String(v.text)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return v
}

function suggestMemberMapping(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {
    memberNo: null, name: null, email: null, phone: null, address: null, status: null,
    iban: null, bic: null, contribution_amount: null, contribution_interval: null,
    mandate_ref: null, mandate_date: null, join_date: null, leave_date: null, notes: null,
    firstName: null, lastName: null, street: null, zip: null, city: null
  }
  
  for (const h of headers) {
    const n = normalizeHeader(h)
    
    // Member number
    if (!map.memberNo && /(mitglied|member|nr|nummer|no|id)/.test(n) && !/telefon|phone/.test(n)) {
      map.memberNo = h
    }
    // Name / First + Last name
    else if (!map.name && /(^name$|vollständig|full)/.test(n)) {
      map.name = h
    }
    else if (!map.firstName && /(vorname|first|given)/.test(n)) {
      map.firstName = h
    }
    else if (!map.lastName && /(nachname|last|family|surname)/.test(n)) {
      map.lastName = h
    }
    // Email
    else if (!map.email && /(email|e-mail|mail)/.test(n)) {
      map.email = h
    }
    // Phone
    else if (!map.phone && /(telefon|phone|tel|handy|mobil|fon)/.test(n)) {
      map.phone = h
    }
    // Address components
    else if (!map.address && /(^adresse$|^address$|anschrift)/.test(n)) {
      map.address = h
    }
    else if (!map.street && /(straße|strasse|street|str\.)/.test(n)) {
      map.street = h
    }
    else if (!map.zip && /(plz|postleitzahl|zip|postal)/.test(n)) {
      map.zip = h
    }
    else if (!map.city && /(ort|stadt|city|town|wohnort)/.test(n)) {
      map.city = h
    }
    // Status
    else if (!map.status && /(status|aktiv|mitglied.*status)/.test(n)) {
      map.status = h
    }
    // Banking
    else if (!map.iban && /(iban)/.test(n)) {
      map.iban = h
    }
    else if (!map.bic && /(bic|swift)/.test(n)) {
      map.bic = h
    }
    // Contribution
    else if (!map.contribution_amount && /(beitrag|contribution|betrag)/.test(n) && !/interval|turnus/.test(n)) {
      map.contribution_amount = h
    }
    else if (!map.contribution_interval && /(interval|turnus|zahlweise|rhythmus)/.test(n)) {
      map.contribution_interval = h
    }
    // SEPA Mandate
    else if (!map.mandate_ref && /(mandat|sepa.*ref|mandate)/.test(n) && !/datum|date/.test(n)) {
      map.mandate_ref = h
    }
    else if (!map.mandate_date && /(mandat.*datum|mandate.*date|sepa.*datum)/.test(n)) {
      map.mandate_date = h
    }
    // Dates
    else if (!map.join_date && /(eintritt|beitritt|join|entry|eintrittsdatum)/.test(n)) {
      map.join_date = h
    }
    else if (!map.leave_date && /(austritt|leave|exit|austrittsdatum)/.test(n)) {
      map.leave_date = h
    }
    // Notes
    else if (!map.notes && /(notiz|notes|bemerkung|kommentar|comment)/.test(n)) {
      map.notes = h
    }
  }
  
  return map
}

function pickWorksheet(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; headerRowIdx: number; headers: string[]; idxByHeader: Record<string, number> } | null {
  let ws: ExcelJS.Worksheet | undefined
  wb.eachSheet((sheet) => { if (!ws && sheet.actualRowCount > 0) ws = sheet })
  if (!ws) return null
  
  // Find header row (first row with meaningful content)
  let headerRowIdx = 1
  for (let r = 1; r <= Math.min(ws.actualRowCount, 15); r++) {
    const row = ws.getRow(r)
    let nonEmpty = 0
    row.eachCell(() => { nonEmpty++ })
    if (nonEmpty >= 2) {
      headerRowIdx = r
      break
    }
  }
  
  const hrow = ws.getRow(headerRowIdx)
  const headers: string[] = []
  const idxByHeader: Record<string, number> = {}
  hrow.eachCell({ includeEmpty: false }, (c, col) => {
    const v = normalizeCellValue(c.value)
    const h = String(v ?? '').trim()
    if (h) {
      headers.push(h)
      idxByHeader[h] = col
    }
  })
  
  if (headers.length === 0) return null
  return { ws, headerRowIdx, headers, idxByHeader }
}

function parseDate(v: any): string | null {
  if (!v) return null
  
  // Already a Date object
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10)
  }
  
  const s = String(v).trim()
  if (!s) return null
  
  // ISO format: YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  
  // German format: DD.MM.YYYY
  const deMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s)
  if (deMatch) {
    const [, d, m, y] = deMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  
  // US format: MM/DD/YYYY
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (usMatch) {
    const [, m, d, y] = usMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  
  // Excel serial number
  const num = Number(s)
  if (!isNaN(num) && num > 25569 && num < 60000) {
    const date = new Date((num - 25569) * 86400000)
    return date.toISOString().slice(0, 10)
  }
  
  return null
}

function parseStatus(v: any): 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT' {
  const s = String(v || '').trim().toUpperCase()
  
  if (/^(ACTIVE|AKTIV|JA|YES|1|TRUE)$/i.test(s)) return 'ACTIVE'
  if (/^(NEW|NEU)$/i.test(s)) return 'NEW'
  if (/^(PAUSED|PAUSIERT|RUHEND)$/i.test(s)) return 'PAUSED'
  if (/^(LEFT|AUSGETRETEN|GEKÜNDIGT|NEIN|NO|0|FALSE)$/i.test(s)) return 'LEFT'
  
  return 'ACTIVE' // default
}

function parseInterval(v: any): 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | null {
  const s = String(v || '').trim().toUpperCase()
  
  if (/^(MONTHLY|MONATLICH|M|1)$/i.test(s)) return 'MONTHLY'
  if (/^(QUARTERLY|QUARTAL|VIERTELJÄHRLICH|Q|3)$/i.test(s)) return 'QUARTERLY'
  if (/^(YEARLY|JÄHRLICH|ANNUAL|J|Y|12)$/i.test(s)) return 'YEARLY'
  
  return null
}

function parseAmount(v: any): number | null {
  if (v == null || v === '') return null
  
  // Handle number type
  if (typeof v === 'number') return v
  
  // Parse string
  const s = String(v).trim()
    .replace(/€|EUR|\s/gi, '')
    .replace(',', '.')
  
  const num = parseFloat(s)
  return isNaN(num) ? null : num
}

/**
 * Detect hint/explanation rows that should be skipped during import.
 * These rows contain help text like "Eindeutige Nummer (Pflicht)" or "oder Spalte".
 */
function isHintRow(rowText: string): boolean {
  const hintPatterns = [
    /\(pflicht\)/i,
    /\(optional\)/i,
    /oder spalte/i,
    /alternativ zu/i,
    /vollständig/i,
    /eindeutige nummer/i,
    /tt\.mm\.jjjj/i,
    /jjjj-mm-tt/i,
    /kontakt e-mail/i,
    /telefonnummer/i,
    /betrag in eur/i,
    /monthly.*quarterly.*yearly/i,
    /active.*new.*paused.*left/i,
    /freitext/i,
  ]
  
  return hintPatterns.some(pattern => pattern.test(rowText))
}

// ============================================================================
// Main Export Functions
// ============================================================================
export async function previewMembersXlsx(base64: string): Promise<MembersImportPreview> {
  const wb = new ExcelJS.Workbook()
  const buf = NodeBuffer.from(base64, 'base64')
  await (wb as any).xlsx.load(buf as any)
  
  const pick = pickWorksheet(wb)
  if (!pick) throw new Error('Keine Tabelle mit Daten gefunden')
  
  const { ws, headerRowIdx, headers, idxByHeader } = pick
  
  // Get sample rows
  const sample: any[] = []
  const maxR = Math.min(ws.actualRowCount, headerRowIdx + 20)
  
  for (let r = headerRowIdx + 1; r <= maxR; r++) {
    const rowObj: any = { _rowIndex: r }
    headers.forEach((h, i) => {
      const col = idxByHeader[h] || (i + 1)
      rowObj[h || `col${i + 1}`] = normalizeCellValue(ws.getRow(r).getCell(col).value)
    })
    
    // Mark hint rows
    const rowText = Object.values(rowObj).filter(v => typeof v === 'string').join(' ').toLowerCase()
    rowObj._isHintRow = isHintRow(rowText)
    
    sample.push(rowObj)
  }
  
  const suggestedMapping = suggestMemberMapping(headers)
  return { headers, sample, suggestedMapping, headerRowIndex: headerRowIdx }
}

export async function executeMembersImport(
  base64: string,
  mapping: Record<string, string | null>,
  options: { updateExisting?: boolean; rowEdits?: Record<number, Record<string, string>> } = {}
): Promise<MembersImportExecuteResult> {
  const wb = new ExcelJS.Workbook()
  const buf = NodeBuffer.from(base64, 'base64')
  await (wb as any).xlsx.load(buf as any)
  
  const pick = pickWorksheet(wb)
  if (!pick) throw new Error('Keine Tabelle mit Daten gefunden')
  
  const { ws, headerRowIdx, headers, idxByHeader } = pick
  const updateExisting = options.updateExisting ?? false
  const rowEdits = options.rowEdits ?? {}
  
  let imported = 0
  let updated = 0
  let skipped = 0
  const errors: Array<{ row: number; message: string }> = []
  const rowStatuses: Array<{ row: number; ok: boolean; message?: string }> = []
  const errorRows: any[] = []
  
  const db = getDb()
  
  // Process each data row
  for (let r = headerRowIdx + 1; r <= ws.actualRowCount; r++) {
    const rowData: any = {}
    headers.forEach((h, i) => {
      const col = idxByHeader[h] || (i + 1)
      rowData[h || `col${i + 1}`] = normalizeCellValue(ws.getRow(r).getCell(col).value)
    })
    
    // Apply user edits from the preview table
    const edits = rowEdits[r]
    if (edits) {
      for (const [header, value] of Object.entries(edits)) {
        if (header in rowData) {
          rowData[header] = value
        }
      }
    }
    
    // Skip empty rows
    const nonEmpty = Object.values(rowData).filter(v => v !== '' && v != null).length
    if (nonEmpty < 2) {
      skipped++
      rowStatuses.push({ row: r, ok: false, message: 'Leere Zeile übersprungen' })
      continue
    }
    
    // Skip hint/explanation rows (detected by typical hint text patterns)
    const rowText = Object.values(rowData).join(' ').toLowerCase()
    if (isHintRow(rowText)) {
      skipped++
      rowStatuses.push({ row: r, ok: false, message: 'Erklärungszeile übersprungen' })
      continue
    }
    
    try {
      // Build member data from mapping - getValue uses edited values if available
      const getValue = (key: string) => {
        const col = mapping[key]
        if (!col) return null
        // Check if user edited this cell in the preview
        const edited = rowEdits[r]?.[col]
        if (edited !== undefined) return edited
        return rowData[col]
      }
      
      // Name: prefer full name, fallback to firstName + lastName
      let name = String(getValue('name') || '').trim()
      if (!name) {
        const firstName = String(getValue('firstName') || '').trim()
        const lastName = String(getValue('lastName') || '').trim()
        name = [firstName, lastName].filter(Boolean).join(' ')
      }
      
      // Address: prefer full address, fallback to street + zip + city
      let address = String(getValue('address') || '').trim()
      if (!address) {
        const street = String(getValue('street') || '').trim()
        const zip = String(getValue('zip') || '').trim()
        const city = String(getValue('city') || '').trim()
        if (street || zip || city) {
          address = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        }
      }
      
      const memberNo = String(getValue('memberNo') || '').trim()
      const email = String(getValue('email') || '').trim() || null
      const phone = String(getValue('phone') || '').trim() || null
      const status = parseStatus(getValue('status'))
      const iban = String(getValue('iban') || '').trim().replace(/\s/g, '') || null
      const bic = String(getValue('bic') || '').trim() || null
      const contribution_amount = parseAmount(getValue('contribution_amount'))
      const contribution_interval = parseInterval(getValue('contribution_interval'))
      const mandate_ref = String(getValue('mandate_ref') || '').trim() || null
      const mandate_date = parseDate(getValue('mandate_date'))
      const join_date = parseDate(getValue('join_date'))
      const leave_date = parseDate(getValue('leave_date'))
      const notes = String(getValue('notes') || '').trim() || null
      
      // Validation
      if (!name) {
        throw new Error(`Name ist erforderlich (Zeile ${r}, got: firstName=${getValue('firstName')}, lastName=${getValue('lastName')}, name=${getValue('name')})`)
      }
      
      if (!memberNo) {
        throw new Error(`Mitgliedsnummer ist erforderlich (Zeile ${r}, mapping.memberNo=${mapping.memberNo})`)
      }
      
      if (!join_date) {
        const rawJoinDate = getValue('join_date')
        throw new Error(`Eintrittsdatum ist erforderlich oder ungültig (Zeile ${r}, got: "${rawJoinDate}", mapping.join_date=${mapping.join_date})`)
      }
      
      // Check for existing member by memberNo
      const existing = db.prepare('SELECT id FROM members WHERE member_no = ?').get(memberNo) as { id: number } | undefined
      
      if (existing) {
        if (updateExisting) {
          // Update existing member
          const fields: string[] = []
          const args: any[] = []
          
          fields.push('name = ?'); args.push(name)
          if (address) { fields.push('address = ?'); args.push(address) }
          if (email) { fields.push('email = ?'); args.push(email) }
          if (phone) { fields.push('phone = ?'); args.push(phone) }
          fields.push('status = ?'); args.push(status)
          if (iban) { fields.push('iban = ?'); args.push(iban) }
          if (bic) { fields.push('bic = ?'); args.push(bic) }
          if (contribution_amount !== null) { fields.push('contribution_amount = ?'); args.push(contribution_amount) }
          if (contribution_interval) { fields.push('contribution_interval = ?'); args.push(contribution_interval) }
          if (mandate_ref) { fields.push('mandate_ref = ?'); args.push(mandate_ref) }
          if (mandate_date) { fields.push('mandate_date = ?'); args.push(mandate_date) }
          if (join_date) { fields.push('join_date = ?'); args.push(join_date) }
          if (leave_date) { fields.push('leave_date = ?'); args.push(leave_date) }
          if (notes) { fields.push('notes = ?'); args.push(notes) }
          fields.push('updated_at = ?'); args.push(new Date().toISOString())
          
          args.push(existing.id)
          db.prepare(`UPDATE members SET ${fields.join(', ')} WHERE id = ?`).run(...args)
          
          updated++
          rowStatuses.push({ row: r, ok: true, message: `Mitglied ${memberNo} aktualisiert` })
        } else {
          skipped++
          rowStatuses.push({ row: r, ok: false, message: `Mitglied ${memberNo} existiert bereits` })
        }
        continue
      }
      
      // Create new member
      createMember({
        memberNo,
        name,
        email,
        phone,
        address: address || null,
        status,
        iban,
        bic,
        contribution_amount,
        contribution_interval,
        mandate_ref,
        mandate_date,
        join_date,
        leave_date,
        notes
      })
      
      imported++
      rowStatuses.push({ row: r, ok: true, message: `Mitglied ${memberNo} importiert` })
      
    } catch (e: any) {
      const msg = e?.message || String(e)
      errors.push({ row: r, message: msg })
      rowStatuses.push({ row: r, ok: false, message: msg })
      errorRows.push({ ...rowData, _error: msg, _row: r })
    }
  }
  
  // Write error file if there are errors
  let errorFilePath: string | undefined
  if (errorRows.length > 0) {
    try {
      const errWb = new ExcelJS.Workbook()
      const errWs = errWb.addWorksheet('Fehler')
      
      const allKeys = ['_row', '_error', ...headers]
      errWs.addRow(['Zeile', 'Fehler', ...headers])
      
      for (const row of errorRows) {
        errWs.addRow(allKeys.map(k => row[k] ?? ''))
      }
      
      // Style header row
      const headerRow = errWs.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } }
      
      const downloadsPath = app.getPath('downloads')
      const fileName = `Mitglieder-Import-Fehler_${new Date().toISOString().slice(0, 10)}_${Date.now()}.xlsx`
      errorFilePath = path.join(downloadsPath, fileName)
      await errWb.xlsx.writeFile(errorFilePath)
    } catch (e) {
      console.error('Failed to write error file:', e)
    }
  }
  
  // Write audit log
  try {
    writeAudit(db as any, null, 'members_import', 0, 'EXECUTE', {
      imported,
      updated,
      skipped,
      errorCount: errors.length,
      errorFilePath,
      when: new Date().toISOString()
    })
  } catch { /* ignore audit failures */ }
  
  return { imported, skipped, updated, errors, rowStatuses, errorFilePath }
}

export async function createMembersTemplate(): Promise<{ filePath: string }> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Mitglieder')
  
  // Define columns with headers and explanations
  const columns = [
    { header: 'Mitgliedsnummer *', key: 'memberNo', width: 18, hint: 'Eindeutige Nummer (Pflicht)' },
    { header: 'Vorname', key: 'firstName', width: 15, hint: 'oder Spalte "Name"' },
    { header: 'Nachname', key: 'lastName', width: 15, hint: 'oder Spalte "Name"' },
    { header: 'Name', key: 'name', width: 25, hint: 'Vollständiger Name (alternativ zu Vor-/Nachname)' },
    { header: 'E-Mail', key: 'email', width: 25, hint: 'Kontakt E-Mail' },
    { header: 'Telefon', key: 'phone', width: 18, hint: 'Telefonnummer' },
    { header: 'Straße', key: 'street', width: 25, hint: 'oder Spalte "Adresse"' },
    { header: 'PLZ', key: 'zip', width: 10, hint: 'oder Spalte "Adresse"' },
    { header: 'Ort', key: 'city', width: 18, hint: 'oder Spalte "Adresse"' },
    { header: 'Adresse', key: 'address', width: 40, hint: 'Vollständige Adresse (alternativ)' },
    { header: 'Status', key: 'status', width: 12, hint: 'ACTIVE, NEW, PAUSED, LEFT' },
    { header: 'Eintrittsdatum *', key: 'join_date', width: 15, hint: 'TT.MM.JJJJ (Pflicht)' },
    { header: 'Austrittsdatum', key: 'leave_date', width: 15, hint: 'TT.MM.JJJJ (optional)' },
    { header: 'Beitrag', key: 'contribution_amount', width: 12, hint: 'Betrag in EUR' },
    { header: 'Beitragsintervall', key: 'contribution_interval', width: 18, hint: 'MONTHLY, QUARTERLY, YEARLY' },
    { header: 'IBAN', key: 'iban', width: 28, hint: 'Bankverbindung' },
    { header: 'BIC', key: 'bic', width: 14, hint: 'BIC/SWIFT Code' },
    { header: 'SEPA-Mandatsreferenz', key: 'mandate_ref', width: 22, hint: 'Mandatsreferenz' },
    { header: 'Mandatsdatum', key: 'mandate_date', width: 15, hint: 'TT.MM.JJJJ' },
    { header: 'Notizen', key: 'notes', width: 30, hint: 'Freitext' },
  ]
  
  // Set columns
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }))
  
  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 28
  
  // Add hint row
  const hintRow = ws.addRow(columns.map(c => c.hint))
  hintRow.font = { italic: true, color: { argb: 'FF666666' } }
  hintRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
  
  // Add 3 example rows
  const today = new Date()
  const joinDate = `01.01.${today.getFullYear()}`
  
  ws.addRow({
    memberNo: '001',
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@example.com',
    phone: '0123 456789',
    street: 'Musterstraße 1',
    zip: '12345',
    city: 'Musterstadt',
    status: 'ACTIVE',
    join_date: joinDate,
    contribution_amount: 60,
    contribution_interval: 'YEARLY',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX'
  })
  
  ws.addRow({
    memberNo: '002',
    name: 'Erika Musterfrau',
    email: 'erika@example.com',
    address: 'Beispielweg 42, 54321 Beispielstadt',
    status: 'ACTIVE',
    join_date: joinDate,
    contribution_amount: 15,
    contribution_interval: 'MONTHLY'
  })
  
  ws.addRow({
    memberNo: '003',
    firstName: 'Test',
    lastName: 'Person',
    status: 'NEW',
    join_date: joinDate
  })
  
  // Show save dialog
  const result = await dialog.showSaveDialog({
    title: 'Mitglieder-Vorlage speichern',
    defaultPath: path.join(app.getPath('downloads'), 'Mitglieder-Vorlage.xlsx'),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  
  if (result.canceled || !result.filePath) {
    throw new Error('Abbruch durch Benutzer')
  }
  
  await wb.xlsx.writeFile(result.filePath)
  return { filePath: result.filePath }
}

export async function createMembersTestData(): Promise<{ filePath: string }> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Mitglieder')
  
  // Headers
  ws.addRow([
    'Mitgliedsnummer', 'Vorname', 'Nachname', 'E-Mail', 'Telefon',
    'Straße', 'PLZ', 'Ort', 'Status', 'Eintrittsdatum', 'Austrittsdatum',
    'Beitrag', 'Beitragsintervall', 'IBAN', 'BIC', 'Notizen'
  ])
  
  // Style header
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
  
  // Sample data
  const firstNames = ['Anna', 'Ben', 'Clara', 'David', 'Eva', 'Felix', 'Greta', 'Hans', 'Ida', 'Jonas']
  const lastNames = ['Müller', 'Schmidt', 'Weber', 'Fischer', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schulz', 'Koch']
  const streets = ['Hauptstraße', 'Bahnhofstraße', 'Gartenweg', 'Waldstraße', 'Bergweg', 'Kirchplatz', 'Am Park', 'Lindenallee']
  const cities = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Stuttgart', 'Dresden', 'Leipzig', 'Hannover', 'Nürnberg']
  const zips = ['10115', '20095', '80331', '50667', '60311', '70173', '01067', '04109', '30159', '90402']
  
  const year = new Date().getFullYear()
  
  for (let i = 0; i < 15; i++) {
    const fn = firstNames[i % firstNames.length]
    const ln = lastNames[i % lastNames.length]
    const cityIdx = i % cities.length
    const joinYear = year - Math.floor(Math.random() * 5)
    const joinMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
    
    let status: string = 'ACTIVE'
    let leaveDate = ''
    if (i === 12) { status = 'NEW' }
    if (i === 13) { status = 'PAUSED' }
    if (i === 14) { 
      status = 'LEFT'
      leaveDate = `31.12.${year - 1}`
    }
    
    ws.addRow([
      String(i + 1).padStart(3, '0'),
      fn,
      ln,
      `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
      `0${170 + i} ${1000000 + i * 111111}`,
      `${streets[i % streets.length]} ${i + 1}`,
      zips[cityIdx],
      cities[cityIdx],
      status,
      `01.${joinMonth}.${joinYear}`,
      leaveDate,
      [30, 60, 120, 15, 10][i % 5],
      ['YEARLY', 'YEARLY', 'YEARLY', 'MONTHLY', 'QUARTERLY'][i % 5],
      i % 3 === 0 ? `DE${89 + i}370400440532013${String(i).padStart(3, '0')}` : '',
      i % 3 === 0 ? 'COBADEFFXXX' : '',
      i === 5 ? 'Gründungsmitglied' : (i === 10 ? 'Ehrenamtlich aktiv' : '')
    ])
  }
  
  // Auto-fit columns
  ws.columns.forEach(col => { col.width = 16 })
  
  // Show save dialog
  const result = await dialog.showSaveDialog({
    title: 'Mitglieder-Testdatei speichern',
    defaultPath: path.join(app.getPath('downloads'), `Mitglieder-Testdaten_${year}.xlsx`),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  
  if (result.canceled || !result.filePath) {
    throw new Error('Abbruch durch Benutzer')
  }
  
  await wb.xlsx.writeFile(result.filePath)
  return { filePath: result.filePath }
}
