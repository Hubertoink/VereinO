import ExcelJS from 'exceljs'
import { getDb, withTransaction } from '../db/database'
import { getOrganizationProfile, listPrimaryClassificationValues, createGeneralClassificationValue } from '../repositories/classifications'
import { listPaymentAccounts, upsertPaymentAccount, type PaymentAccountKind } from '../repositories/paymentAccounts'
import { upsertBudget } from '../repositories/budgets'
import { upsertBinding } from '../repositories/bindings'
import { ensureTag } from '../repositories/tags'
import { ACCOUNT_KIND_LABELS, IMPORT_MASTER_SHEETS, ImportMasterRowSchema, importNumber, normalizeAccountKind, type ImportMasterRow } from '../../../shared/importMasterData'

const key = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('de')
const spheres = ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']
export type MasterOption = { id: number; name: string; label: string; kind?: string; year?: number; sphere?: string; amountPlanned?: number; category?: string; code?: string; active: boolean }
export type MasterSnapshot = Record<ImportMasterRow['entity'], MasterOption[]>

export function getImportMasterSnapshot(): MasterSnapshot {
  const d = getDb()
  const general = getOrganizationProfile() === 'GENERAL'
  return {
    paymentAccounts: listPaymentAccounts().map(a => ({ ...a, label: `#${a.id} | ${a.name} [${a.kind}]`, active: !!a.isActive })),
    tags: (d.prepare('SELECT id, name FROM tags').all() as Array<{ id: number; name: string }>).map(t => ({ ...t, label: t.name, active: true })),
    categories: general ? listPrimaryClassificationValues({ includeInactive: true }).map(c => ({ ...c, label: `#${c.id} | ${c.name}`, active: c.isActive })) : [],
    budgets: (d.prepare(`SELECT b.id, b.name, b.year, b.sphere, b.amount_planned as amountPlanned,
      b.category_name as categoryName, b.project_name as projectName, b.is_archived as isArchived, cv.name as category
      FROM budgets b LEFT JOIN classification_values cv ON cv.id = b.primary_classification_value_id`).all() as any[]).map(b => {
      const name = b.name || b.categoryName || b.projectName || `Budget ${b.id}`
      return { ...b, name, label: `#${b.id} | ${b.year} · ${b.sphere} · ${name}`, active: !b.isArchived }
    }),
    earmarks: (d.prepare('SELECT id, code, name, is_active as isActive FROM earmarks').all() as any[])
      .map(e => ({ ...e, label: `#${e.id} | ${e.code} · ${e.name}`, active: !!e.isActive }))
  }
}

// Only explicit #IDs are identifiers. Names such as "2026 Sommerfest" remain names.
export function matchMaster(value: unknown, options: MasterOption[]): MasterOption | undefined {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const id = /^#(\d+)(?:\s*\||$)/.exec(text)
  if (id) return options.find(o => o.id === Number(id[1]))
  const matches = options.filter(o => [o.name, o.label, o.code].some(v => v && key(v) === key(text)))
  return matches.length === 1 ? matches[0] : undefined
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value && typeof value === 'object' && 'formula' in value) return String(value.result ?? '').trim()
  return cell.text.trim()
}

export function readImportMasterSheets(wb: ExcelJS.Workbook): ImportMasterRow[] {
  const rows: ImportMasterRow[] = []
  for (const [entity, name] of Object.entries(IMPORT_MASTER_SHEETS)) {
    const ws = wb.worksheets.find(s => key(s.name) === key(name))
    if (!ws) continue
    let header = 0
    const cols: Record<string, number> = {}
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      const candidate: Record<string, number> = {}
      ws.getRow(r).eachCell((cell, col) => { candidate[key(cellText(cell))] = col })
      if (candidate.name || candidate.kontoname || candidate.tag || candidate.kategorie) {
        Object.assign(cols, candidate); header = r; break
      }
    }
    if (!header) {
      if (ws.actualRowCount) rows.push(ImportMasterRowSchema.parse({ id: `${name}:header`, entity, sourceSheet: name, sourceRow: 1, reference: '', name: '' }))
      continue
    }
    for (let r = header + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      if (!row.hasValues || !Object.values(cols).some(c => cellText(row.getCell(c)))) continue
      const get = (...names: string[]) => {
        const col = names.map(n => cols[n]).find(Boolean)
        return col ? cellText(row.getCell(col)) : ''
      }
      const rowName = get('name', 'kontoname', 'tag', 'kategorie')
      rows.push(ImportMasterRowSchema.parse({
        id: `${name}:${r}`, entity, sourceSheet: name, sourceRow: r,
        reference: get('referenz') || rowName, name: rowName,
        kind: get('typ', 'kontotyp'), year: get('jahr'), amountPlanned: get('planbetrag', 'geplanter betrag'),
        sphere: get('sphäre', 'sphaere'), category: get('kategorie'), code: get('code')
      }))
    }
  }
  return rows
}

export function validateImportMasters(input: ImportMasterRow[], snapshot: MasterSnapshot, general: boolean): ImportMasterRow[] {
  const rows = input.map(raw => ({ ...raw, name: raw.entity === 'categories' ? raw.name.trim().replace(/\s+/g, ' ') : raw.name.trim(), reference: raw.reference.trim() || raw.name.trim(), year: raw.year.trim(), sphere: raw.sphere.trim().toUpperCase(), code: raw.code.trim(), kind: normalizeAccountKind(raw.kind), issues: [] as string[], existingId: undefined as number | undefined, status: 'new' as ImportMasterRow['status'] }))
  for (const row of rows) {
    const fail = (message: string) => row.issues.push(message)
    if (!row.name) fail('Name fehlt. Bitte die Kopfzeile „Name“ und den Eintrag prüfen.')
    if (row.entity === 'tags' && /[;,]/.test(row.name)) fail('Bitte pro Zeile einen Tag ohne Semikolon oder Komma angeben.')
    if (row.entity === 'categories' && !general) fail('Eigene Kategorien sind nur für allgemeine Organisationen möglich.')
    const duplicates = rows.filter(other => other !== row && other.entity === row.entity &&
      (key(other.reference) === key(row.reference) || (key(other.name) === key(row.name) && (row.entity !== 'budgets' || other.year === row.year))))
    if (duplicates.length) fail('Eintrag ist in der Datei mehrfach definiert. Bitte eindeutige Namen bzw. Referenzen verwenden.')
    // An explicit reference identifies an existing record; never overwrite it from a workbook.
    const explicit = /^#\d+(?:\s*\||$)/.test(row.reference)
    let existing = matchMaster(explicit ? row.reference : row.name, snapshot[row.entity])
    if (!explicit && row.entity === 'budgets' && row.year) {
      const candidates = snapshot.budgets.filter(b => key(b.name) === key(row.name) && b.year === Number(row.year) && (general || b.sphere === row.sphere))
      existing = candidates.length === 1 ? candidates[0] : undefined
    }
    if (explicit && !existing) fail('Referenz ist in dieser Organisation nicht vorhanden. Bitte neu zuordnen.')
    if (existing) {
      row.existingId = existing.id
      row.status = 'existing'
      if (!existing.active) fail('Der vorhandene Eintrag ist inaktiv oder archiviert.')
      if (key(existing.name) !== key(row.name)) fail('Name und vorhandene Referenz stimmen nicht überein.')
      if (row.entity === 'paymentAccounts' && row.kind && row.kind !== existing.kind) fail('Kontotyp weicht vom vorhandenen Konto ab.')
      if (row.entity === 'earmarks' && row.code && key(row.code) !== key(existing.code)) fail('Code weicht von der vorhandenen Zweckbindung ab.')
      if (row.entity === 'budgets' && ((row.year && Number(row.year) !== existing.year) || (!general && row.sphere && row.sphere !== existing.sphere) || (row.amountPlanned && importNumber(row.amountPlanned) !== existing.amountPlanned) || (general && row.category && key(row.category) !== key(existing.category)))) fail('Budgetangaben weichen vom vorhandenen Budget ab. Bestehende Budgets werden hier nicht geändert.')
    } else {
      if (snapshot[row.entity].filter(o => key(o.name) === key(row.name)).length > 1 && row.entity !== 'budgets') fail('Mehrere vorhandene Einträge passen. Bitte eine eindeutige Referenz wählen.')
      if (row.entity === 'paymentAccounts' && !Object.keys(ACCOUNT_KIND_LABELS).includes(row.kind)) fail('Bitte einen Kontotyp zuordnen (z. B. Bankkonto oder Barkonto).')
      if (row.entity === 'categories' && row.name.length > 100) fail('Kategorienamen dürfen höchstens 100 Zeichen enthalten.')
      if (row.entity === 'budgets') {
        if (!/^\d{4}$/.test(row.year) || Number(row.year) < 1900 || Number(row.year) > 9999) fail('Bitte ein gültiges Budgetjahr angeben.')
        const planned = importNumber(row.amountPlanned)
        if (planned == null || planned < 0) fail('Bitte einen Planbetrag ab 0 angeben.')
        if (!general && !spheres.includes(row.sphere)) fail('Bitte eine gültige Sphäre zuordnen.')
      }
      if (row.entity === 'earmarks' && !row.code) fail('Bitte einen eindeutigen Code angeben.')
      if (row.entity === 'earmarks' && (snapshot.earmarks.some(e => key(e.code) === key(row.code)) || rows.some(other => other !== row && other.entity === 'earmarks' && key(other.code) === key(row.code)))) fail('Dieser Zweckbindungs-Code ist bereits vergeben.')
    }
    if (row.issues.length) row.status = 'error'
  }
  for (const row of rows) {
    if (row.entity !== 'budgets' || !general || !row.category) continue
    const category = matchMaster(row.category, snapshot.categories)
    const pending = rows.find(c => c.entity === 'categories' && [c.reference, c.name].some(n => key(n) === key(row.category)))
    if (!category?.active && (!pending || pending.status === 'error')) {
      row.issues.push('Budget-Kategorie nicht gefunden. Bitte im Reiter Kategorien ergänzen oder zuordnen.')
      row.status = 'error'
    }
  }
  return rows
}

export function createImportMasters(input: ImportMasterRow[]) {
  return withTransaction(() => {
    const general = getOrganizationProfile() === 'GENERAL'
    const rows = validateImportMasters(input, getImportMasterSnapshot(), general)
    const errors = rows.filter(r => r.status === 'error')
    if (errors.length) throw new Error(errors.map(r => `${r.sourceSheet}, Zeile ${r.sourceRow}: ${r.issues.join(' ')}`).join('\n'))
    const created = { tags: 0, paymentAccounts: 0, budgets: 0, categories: 0, earmarks: 0 }
    // Categories precede budgets so their references exist within the same transaction.
    for (const entity of ['categories', 'tags', 'paymentAccounts', 'earmarks', 'budgets'] as const) {
      for (const row of rows.filter(r => r.entity === entity && r.status === 'new')) {
        if (entity === 'categories') createGeneralClassificationValue({ name: row.name })
        if (entity === 'tags') ensureTag(getDb(), row.name)
        if (entity === 'paymentAccounts') upsertPaymentAccount({ name: row.name, kind: row.kind as PaymentAccountKind, isActive: true })
        if (entity === 'earmarks') upsertBinding({ code: row.code, name: row.name, isActive: true })
        if (entity === 'budgets') {
          const snapshot = getImportMasterSnapshot()
          const definition = rows.find(c => c.entity === 'categories' && [c.reference, c.name].some(n => key(n) === key(row.category)))
          const category = general ? matchMaster(definition?.name || row.category, snapshot.categories) : undefined
          upsertBudget({ name: row.name, year: Number(row.year), amountPlanned: importNumber(row.amountPlanned)!, sphere: general ? 'IDEELL' : row.sphere as 'IDEELL', primaryClassificationValueId: category?.id })
        }
        created[entity]++
      }
    }
    return created
  })
}

export function addImportMasterSheets(wb: ExcelJS.Workbook) {
  const snapshot = getImportMasterSnapshot()
  const general = getOrganizationProfile() === 'GENERAL'
  for (const entity of Object.keys(IMPORT_MASTER_SHEETS) as ImportMasterRow['entity'][]) {
    if (entity === 'categories' && !general) continue
    const ws = wb.addWorksheet(IMPORT_MASTER_SHEETS[entity])
    const listName = { paymentAccounts: 'ImportAccounts', categories: 'ImportCategories', budgets: 'ImportBudgets', earmarks: 'ImportEarmarks', tags: 'ImportTags' }[entity]
    wb.definedNames.add(`'${ws.name}'!$B$2:$B$10000`, listName)
    const columns = ['Referenz', 'Name', ...(entity === 'paymentAccounts' ? ['Typ'] : []), ...(entity === 'budgets' ? ['Jahr', 'Planbetrag', general ? 'Kategorie' : 'Sphäre'] : []), ...(entity === 'earmarks' ? ['Code'] : [])]
    ws.addRow(columns)
    for (const item of snapshot[entity].filter(o => o.active)) {
      ws.addRow([item.label, item.name, ...(entity === 'paymentAccounts' ? [item.kind] : []), ...(entity === 'budgets' ? [item.year, item.amountPlanned, general ? item.category || '' : item.sphere] : []), ...(entity === 'earmarks' ? [item.code] : [])])
    }
    ws.columns = columns.map((c, i) => ({ width: i === 0 ? 48 : c === 'Name' ? 32 : 22 }))
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: 'A1', to: { row: Math.max(2, ws.rowCount), column: columns.length } }
    if (entity === 'paymentAccounts') (ws as any).dataValidations.add('C2:C10000', { type: 'list', allowBlank: true, formulae: ['"BANK,CASH,PAYPAL,CARD,OTHER"'] })
    if (entity === 'budgets' && !general) (ws as any).dataValidations.add('E2:E10000', { type: 'list', allowBlank: true, formulae: ['"IDEELL,ZWECK,VERMOEGEN,WGB"'] })
    if (entity === 'budgets') ws.getColumn(4).numFmt = '#,##0.00'
  }
}
