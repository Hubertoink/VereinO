import { getDb } from '../db/database'
import { ensureAiTables } from '../db/migrations'

export type AiAgentMemoryRow = {
  id: number
  scope: 'ORG' | 'USER' | 'SESSION'
  key: string
  value: string
  source?: string | null
  confidence: number
  isActive: number
  createdAt: string
  updatedAt: string
}

export type AiAgentAutoRuleRow = {
  id: number
  name: string
  draftKind: string
  conditions: Record<string, unknown>
  action: 'AUTO_PRESELECT' | 'AUTO_APPLY_SAFE'
  enabled: number
  createdAt: string
  updatedAt: string
}

function db() {
  const d = getDb()
  ensureAiTables(d as any)
  return d
}

function parseJsonObject(value?: string | null) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mapMemory(row: any): AiAgentMemoryRow {
  return {
    id: Number(row.id),
    scope: row.scope,
    key: row.key,
    value: row.value,
    source: row.source ?? null,
    confidence: Number(row.confidence ?? 1),
    isActive: Number(row.isActive ?? row.is_active ?? 1),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapRule(row: any): AiAgentAutoRuleRow {
  return {
    id: Number(row.id),
    name: row.name,
    draftKind: row.draftKind,
    conditions: parseJsonObject(row.conditionsJson),
    action: row.action,
    enabled: Number(row.enabled ?? 1),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listAiAgentMemory(input: { activeOnly?: boolean; scope?: 'ORG' | 'USER' | 'SESSION'; limit?: number } = {}) {
  const d = db()
  const wh: string[] = []
  const params: any[] = []
  if (input.activeOnly !== false) wh.push('is_active = 1')
  if (input.scope) { wh.push('scope = ?'); params.push(input.scope) }
  const limit = Math.max(1, Math.min(500, Number(input.limit || 120)))
  params.push(limit)
  const rows = d.prepare(`
    SELECT id, scope, key, value, source, confidence, is_active as isActive, created_at as createdAt, updated_at as updatedAt
    FROM ai_agent_memory
    ${wh.length ? `WHERE ${wh.join(' AND ')}` : ''}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).all(...params) as any[]
  return rows.map(mapMemory)
}

export function upsertAiAgentMemory(input: {
  scope?: 'ORG' | 'USER' | 'SESSION'
  key: string
  value: string
  source?: string | null
  confidence?: number
  isActive?: boolean
}) {
  const d = db()
  const scope = input.scope || 'ORG'
  const key = String(input.key || '').trim()
  const value = String(input.value || '').trim()
  if (!key || !value) throw new Error('Memory braucht key und value.')
  const confidence = Math.max(0, Math.min(1, Number(input.confidence ?? 1)))
  d.prepare(`
    INSERT INTO ai_agent_memory(scope, key, value, source, confidence, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope, key) DO UPDATE SET
      value = excluded.value,
      source = excluded.source,
      confidence = excluded.confidence,
      is_active = excluded.is_active,
      updated_at = datetime('now')
  `).run(scope, key, value, input.source ?? null, confidence, input.isActive === false ? 0 : 1)
  return listAiAgentMemory({ activeOnly: false, scope }).find((row) => row.key === key)!
}

export function listAiAgentAutoRules(input: { enabledOnly?: boolean; draftKind?: string; limit?: number } = {}) {
  const d = db()
  const wh: string[] = []
  const params: any[] = []
  if (input.enabledOnly !== false) wh.push('enabled = 1')
  if (input.draftKind) { wh.push('draft_kind = ?'); params.push(input.draftKind) }
  const limit = Math.max(1, Math.min(200, Number(input.limit || 80)))
  params.push(limit)
  const rows = d.prepare(`
    SELECT id, name, draft_kind as draftKind, conditions_json as conditionsJson, action, enabled, created_at as createdAt, updated_at as updatedAt
    FROM ai_agent_auto_rules
    ${wh.length ? `WHERE ${wh.join(' AND ')}` : ''}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).all(...params) as any[]
  return rows.map(mapRule)
}

export function upsertAiAgentAutoRule(input: {
  id?: number
  name: string
  draftKind: string
  conditions?: Record<string, unknown>
  action?: 'AUTO_PRESELECT' | 'AUTO_APPLY_SAFE'
  enabled?: boolean
}) {
  const d = db()
  const name = String(input.name || '').trim()
  const draftKind = String(input.draftKind || '').trim()
  if (!name || !draftKind) throw new Error('Auto-Approve-Regel braucht name und draftKind.')
  const conditionsJson = JSON.stringify(input.conditions || {})
  if (input.id) {
    d.prepare(`
      UPDATE ai_agent_auto_rules
      SET name = ?, draft_kind = ?, conditions_json = ?, action = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, draftKind, conditionsJson, input.action || 'AUTO_PRESELECT', input.enabled === false ? 0 : 1, input.id)
    return listAiAgentAutoRules({ enabledOnly: false }).find((row) => row.id === input.id)!
  }
  const info = d.prepare(`
    INSERT INTO ai_agent_auto_rules(name, draft_kind, conditions_json, action, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, draftKind, conditionsJson, input.action || 'AUTO_PRESELECT', input.enabled === false ? 0 : 1)
  return listAiAgentAutoRules({ enabledOnly: false }).find((row) => row.id === Number(info.lastInsertRowid))!
}

function normalize(value: unknown) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
}

function valueMatches(actual: unknown, expected: unknown): boolean {
  if (expected == null || expected === '') return true
  if (Array.isArray(expected)) return expected.some((item) => valueMatches(actual, item))
  if (typeof expected === 'number') return Number(actual) === expected
  if (typeof expected === 'boolean') return Boolean(actual) === expected
  return normalize(actual).includes(normalize(expected))
}

export function matchingAiAgentAutoRules(draftKind: string, payload: unknown) {
  const rules = listAiAgentAutoRules({ enabledOnly: true, draftKind })
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  return rules.filter((rule) => {
    const conditions = rule.conditions || {}
    return Object.entries(conditions).every(([key, expected]) => valueMatches(data[key], expected))
  })
}
