import { z } from 'zod'
import type { AiMasterDataProposal } from '../../../shared/aiMasterDataPolicy'
import { withTransaction } from '../db/database'
import { getAiMasterDataPermissions } from './aiMasterDataPolicy'
export { getAiMasterDataPermissions } from './aiMasterDataPolicy'
import { ensureTag, listTags } from '../repositories/tags'
import { upsertBudget } from '../repositories/budgets'
import { upsertBinding } from '../repositories/bindings'
import { upsertParty } from '../repositories/parties'
import { writeAudit } from './audit'

const key = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim()
const areaLabels = { tags: 'Tags', budgets: 'Budgets', earmarks: 'Zweckbindungen', suppliers: 'Lieferanten', customers: 'Kunden' }
export const AiMasterDataCreateInput = z.object({
  kind: z.enum(['tags', 'budgets', 'earmarks', 'suppliers', 'customers']),
  name: z.string().trim().min(1).max(160),
  year: z.number().int().min(1900).max(2200).nullable().optional(),
  sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']).nullable().optional(),
  code: z.string().trim().min(1).max(40).nullable().optional()
})

/** A create-only boundary: current permissions, duplicate detection and write are synchronous. */
export function createAiMasterData(raw: unknown) {
  const input = AiMasterDataCreateInput.parse(raw)
  return withTransaction(d => {
    const permissions = getAiMasterDataPermissions()
    const { kind, name } = input
    const table = { tags: 'tags', budgets: 'budgets', earmarks: 'earmarks', suppliers: 'parties', customers: 'parties' }[kind]
    const rows = d.prepare(`SELECT * FROM ${table}`).all() as any[]
    if (kind === 'budgets' && (!input.year || !input.sphere)) throw new Error('Budgetjahr und Sphäre fehlen.')
    const matches = rows.filter(row => {
      const sameName = key(row.name || '') === key(name) || (row.legal_name && key(row.legal_name) === key(name))
      if (kind === 'budgets') return sameName && row.year === input.year && row.sphere === input.sphere
      if (kind === 'earmarks') return sameName || (input.code && key(row.code) === key(input.code))
      return sameName
    })
    if (matches.length > 1) throw new Error(`Mehrere vorhandene Einträge für „${name}“; bitte manuell zuordnen.`)
    if (matches.length) {
      const existing = matches[0]
      if (existing.is_archived || existing.is_active === 0) throw new Error(`„${name}“ ist archiviert oder inaktiv; bitte manuell prüfen.`)
      if (kind === 'earmarks' && key(existing.name) !== key(name)) throw new Error(`Der Zweckbindungscode „${input.code}“ ist bereits anders vergeben.`)
      return { id: Number(existing.id), name: String(existing.name), kind, created: false }
    }
    if (!permissions[kind]) throw new Error(`Automatische Anlage ist für ${areaLabels[kind]} nicht freigegeben: „${name}“.`)
    let id: number
    if (kind === 'tags') id = ensureTag(d, name)!.id
    else if (kind === 'budgets') id = upsertBudget({ name, year: input.year!, sphere: input.sphere!, amountPlanned: 0 }).id
    else if (kind === 'earmarks') {
      if (!input.code) throw new Error('Ein Zweckbindungscode ist erforderlich.')
      id = upsertBinding({ name, code: input.code }).id
    } else id = upsertParty({ name, role: kind === 'suppliers' ? 'SUPPLIER' : 'CUSTOMER' }).id
    writeAudit(d, null, table, id, 'CREATE', { name, source: 'AI', permission: kind })
    return { id, name, kind, created: true }
  })
}

type Candidate = {
  date: string; sphere: string; grossAmount: number; counterparty?: string | null
  partyId?: number | null; tags?: string[]
  budgets?: Array<{ id: number; amount: number }>; earmarks?: Array<{ id: number; amount: number }>
  masterData?: AiMasterDataProposal | null; masterDataCreated?: string[]; warnings?: string[]
}

/** Resolve model proposals only after the enclosing booking suggestion has passed validation. */
export function resolveAiMasterData<T extends Candidate>(candidate: T): T & { warnings: string[]; masterDataCreated: string[] } {
  const warnings = [...(candidate.warnings || [])]
  const created = [...(candidate.masterDataCreated || [])]
  const proposal = candidate.masterData
  const result = { ...candidate, masterData: undefined, tags: [] as string[],
    budgets: [...(candidate.budgets || [])], earmarks: [...(candidate.earmarks || [])], warnings, masterDataCreated: created }
  function resolve(raw: z.input<typeof AiMasterDataCreateInput>) {
    try {
      const item = createAiMasterData(raw)
      if (item.created) created.push(`${({ tags: 'Tag', budgets: 'Budget', earmarks: 'Zweckbindung', suppliers: 'Lieferant', customers: 'Kunde' })[item.kind]}: ${item.name}`)
      return item
    } catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); return null }
  }
  const existingTags = candidate.tags?.length ? listTags() : []
  for (const name of [...new Set(candidate.tags || [])].slice(0, 20)) {
    const existing = existingTags.find(tag => key(tag.name) === key(name))
    const tag = existing || resolve({ kind: 'tags', name })
    if (tag && !result.tags.some(name => key(name) === key(tag.name))) result.tags.push(tag.name)
  }
  for (const kind of ['budgets', 'earmarks'] as const) {
    for (const item of proposal?.[kind] || []) {
      const assigned = result[kind].reduce((sum, row) => sum + Math.round(row.amount * 100), 0)
      if (assigned + Math.round(item.amount * 100) > Math.round(candidate.grossAmount * 100)) {
        warnings.push(`„${item.name}“ nicht angelegt: Zuordnung überschreitet den Buchungsbetrag.`)
        continue
      }
      const entry = resolve({ kind, name: item.name, year: Number(candidate.date.slice(0, 4)),
        sphere: candidate.sphere as 'IDEELL', code: 'code' in item ? String(item.code) : undefined })
      if (entry && !result[kind].some(row => row.id === entry.id)) result[kind].push({ id: entry.id, amount: item.amount })
    }
  }
  if (proposal?.party) {
    if (key(proposal.party.name) !== key(candidate.counterparty || '')) warnings.push('Geschäftspartner nicht angelegt: Name stimmt nicht mit der Gegenpartei überein.')
    else {
      const entry = resolve({ kind: proposal.party.role === 'SUPPLIER' ? 'suppliers' : 'customers', name: proposal.party.name })
      if (entry) result.partyId = entry.id
    }
  }
  return result
}
