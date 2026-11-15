import ExcelJS from 'exceljs'
import { detectHeader, normalizeCellValue, suggestMapping } from './imports'
import { IMPORT_MASTER_SHEETS } from '../../../shared/importMasterData'

export function csvRecords(text: string): string[][] {
  const first = text.split(/\r?\n/).find(line => line.trim()) || ''
  const unquotedHeader = first.replace(/"(?:[^"]|"")*"/g, '')
  const delimiter = [';', ',', '\t'].sort((a, b) => unquotedHeader.split(b).length - unquotedHeader.split(a).length)[0]
  const records: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (c === delimiter && !quoted) { row.push(cell); cell = '' }
    else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); records.push(row); row = []; cell = ''
    } else cell += c
  }
  if (quoted) throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.')
  row.push(cell)
  if (row.some(Boolean)) records.push(row)
  return records
}

export async function loadAiImportWorkbook(fileName: string, fileBase64: string) {
  const bytes = Buffer.from(fileBase64, 'base64')
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Bitte eine Excel-/CSV-Datei bis 10 MB auswählen.')
  const wb = new ExcelJS.Workbook()
  if (/\.xlsx$/i.test(fileName)) await wb.xlsx.load(bytes as any)
  else if (/\.csv$/i.test(fileName)) {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : 'utf-8'
    let csv = new TextDecoder(encoding).decode(bytes)
    if (encoding === 'utf-8' && csv.includes('\uFFFD')) csv = new TextDecoder('windows-1252').decode(bytes)
    const records = csvRecords(csv.replace(/^\uFEFF/, ''))
    if (records.length > 10000) throw new Error('Zu viele CSV-Zeilen. Bitte die Datei aufteilen.')
    wb.addWorksheet('Buchungen').addRows(records)
  } else throw new Error('Der KI-Import unterstützt .xlsx und .csv.')
  return wb
}

export function importSheetPreviews(wb: ExcelJS.Workbook) {
  const reserved = [...Object.values(IMPORT_MASTER_SHEETS), 'Listen', 'PowerQuery_Hinweis', 'Hinweise', 'Testfälle'].map(s => s.toLowerCase())
  return wb.worksheets.filter(ws => ws.state === 'visible' && !reserved.includes(ws.name.toLowerCase())).map(ws => {
    const { headerRowIdx, headers, idxByHeader } = detectHeader(ws)
    const sample: Array<Record<string, unknown>> = []
    let count = 0
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return
      const values = Object.fromEntries(headers.map(h => [h, normalizeCellValue(row.getCell(idxByHeader[h]).value)]))
      if (Object.values(values).every(v => v == null || String(v).trim() === '')) return
      count++
      if (sample.length < 8) sample.push(values)
    })
    return { name: ws.name, headerRow: headerRowIdx, headers, sample, count, mapping: suggestMapping(headers) }
  }).filter(s => s.headers.length > 1)
}
