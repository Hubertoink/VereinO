import type { AiImportRow } from '../../../../../../shared/aiImport'
import { importNumber, type ImportMasterRow } from '../../../../../../shared/importMasterData'

export const phaseLabels = { mapping: 'Spalten erkennen', extract: 'Buchungen auslesen', classify: 'Konten und Einordnung', groups: 'Tags und Budgets gruppieren', relations: 'Beziehungen prüfen', validate: 'Entwurf validieren', done: 'Prüfung abgeschlossen' } as const
export const analysisPhases = ['mapping', 'extract', 'classify', 'groups', 'relations', 'validate'] as const
export const statusLabels = { paused: 'Pausiert', running: 'Analyse läuft', review: 'Bereit zur Prüfung', failed: 'Unterbrochen', committed: 'Übernommen' } as const
export const originLabels = { source: 'Aus Datei', default: 'Nutzervorgabe', ai: 'KI-Vorschlag', user: 'Manuell geändert' } as const
export const relationLabels = { duplicate: 'Mögliches Duplikat', reversal: 'Mögliches Storno', refund: 'Mögliche Erstattung', transfer: 'Mögliche Umbuchung', unclear: 'Unklare Beziehung' } as const
export const fieldLabels = { date: 'Datum', description: 'Beschreibung', type: 'Art', sphere: 'Sphäre', category: 'Kategorie', paymentAccount: 'Konto', paymentMethod: 'Zahlweg', grossAmount: 'Betrag / Brutto', inGross: 'Einnahmen', outGross: 'Ausgaben', netAmount: 'Netto', vatRate: 'USt %', tags: 'Tags', budget: 'Budget', budgetAmount: 'Budget-Betrag', earmarkCode: 'Zweckbindung', earmarkAmount: 'Zweckbindungs-Betrag', note: 'Kommentar' } as const
export type FieldKey = keyof typeof fieldLabels
export const SPHERES = ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const
export const masterFieldByEntity = { tags: 'tags', budgets: 'budget', categories: 'category', paymentAccounts: 'paymentAccount', earmarks: 'earmarkCode' } as const

export type RowState = 'ok' | 'warning' | 'error' | 'duplicate' | 'ignored' | 'excluded'
export type RowFilter = 'all' | 'ok' | 'attention' | 'warning' | 'error' | 'excluded'
export const rowStateLabels: Record<RowState, string> = { ok: 'OK', warning: 'Hinweis', error: 'Korrigieren', duplicate: 'Duplikat', ignored: 'Ignoriert', excluded: 'Nicht importieren' }

export function rowState(row: AiImportRow): RowState {
  if (!row.selected) return row.draft.status === 'ignored' ? 'ignored' : 'excluded'
  return row.draft.status
}

export function matchesFilter(state: RowState, filter: RowFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'attention') return state === 'warning' || state === 'duplicate' || state === 'error'
  if (filter === 'warning') return state === 'warning' || state === 'duplicate'
  if (filter === 'excluded') return state === 'excluded' || state === 'ignored'
  return state === filter
}

export function rowHints(row: AiImportRow): string[] {
  return [...row.draft.issues.map(i => i.message), ...Object.values(row.reasons).filter(r => r.includes('weicht'))]
}

export function parseAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  return importNumber(String(value ?? '').replace(/[€\s]/g, ''))
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const formatEuro = (amount: number): string => euro.format(amount)
export function formatAmount(value: unknown): string {
  const amount = parseAmount(value)
  return amount === undefined ? String(value ?? '') : euro.format(amount)
}

export function formatDate(value: unknown): string {
  const text = String(value ?? '')
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text
}

export function splitTags(value: unknown): string[] {
  return String(value ?? '').split(/[;,]/).map(t => t.trim()).filter(Boolean)
}

/** Number of bookings that reference a master data entry by name or source reference. */
export function masterUsage(master: ImportMasterRow, rows: readonly AiImportRow[]): number {
  const names = new Set([master.name, master.reference].map(n => n.trim().toLocaleLowerCase('de')).filter(Boolean))
  const field = masterFieldByEntity[master.entity]
  return rows.filter(r => {
    const value = r.draft.values[field]
    return field === 'tags' ? splitTags(value).some(t => names.has(t.toLocaleLowerCase('de'))) : names.has(String(value ?? '').trim().toLocaleLowerCase('de'))
  }).length
}

export function uniqueValues(rows: readonly AiImportRow[], field: string): string[] {
  const values = rows.flatMap(r => field === 'tags' ? splitTags(r.draft.values.tags) : [String(r.draft.values[field] ?? '').trim()])
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))
}
