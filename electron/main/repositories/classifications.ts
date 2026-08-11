import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  CLASSIFICATION_SCHEME_KEYS,
  ORGANIZATION_PROFILE_DEFINITIONS,
  type ClassificationScheme,
  type ClassificationValue,
  type NonprofitSphereKey,
  type OrganizationProfile
} from '../../../shared/classification'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

type Row = Record<string, unknown>

function asBoolean(value: unknown) {
  return Number(value) !== 0
}

function mapScheme(row: Row): ClassificationScheme {
  return {
    id: Number(row.id),
    key: String(row.key) as ClassificationScheme['key'],
    label: String(row.label),
    labelPlural: String(row.labelPlural),
    description: row.description == null ? null : String(row.description),
    required: asBoolean(row.required),
    isSystem: asBoolean(row.isSystem),
    isActive: asBoolean(row.isActive)
  }
}

function mapValue(row: Row): ClassificationValue {
  return {
    id: Number(row.id),
    schemeId: Number(row.schemeId),
    stableKey: String(row.stableKey),
    name: String(row.name),
    color: row.color == null ? null : String(row.color),
    icon: row.icon == null ? null : String(row.icon),
    description: row.description == null ? null : String(row.description),
    sortOrder: Number(row.sortOrder),
    isSystem: asBoolean(row.isSystem),
    isActive: asBoolean(row.isActive)
  }
}

function normalizeCategoryName(name: string) {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Ein Kategoriename ist erforderlich.')
  if (normalized.length > 100) throw new Error('Ein Kategoriename darf höchstens 100 Zeichen lang sein.')
  return normalized
}

function getProfileRow(d: DB): { profile: OrganizationProfile } {
  const row = d.prepare('SELECT profile FROM organization_profile WHERE id = 1').get() as
    | { profile?: OrganizationProfile }
    | undefined
  return { profile: row?.profile === 'GENERAL' ? 'GENERAL' : 'NONPROFIT' }
}

/**
 * Resolves the value persisted on a financial record. In a non-profit
 * organisation the legacy sphere remains the source of truth during the
 * transition, so a mismatching user-supplied id is rejected instead of silently
 * creating contradictory reports.
 */
export function resolvePrimaryClassificationValueId(
  d: DB,
  input: { legacySphere: NonprofitSphereKey; primaryClassificationValueId?: number | null }
) {
  const profile = getProfileRow(d).profile
  const schemeKey = ORGANIZATION_PROFILE_DEFINITIONS[profile].primarySchemeKey
  const requestedId = input.primaryClassificationValueId
  const row = requestedId == null
    ? d
        .prepare(`
          SELECT cv.id, cv.stable_key as stableKey, cv.is_active as isActive
          FROM classification_values cv
          JOIN classification_schemes cs ON cs.id = cv.scheme_id
          WHERE cs.key = ? AND cv.stable_key = ?
        `)
        .get(schemeKey, input.legacySphere) as { id?: number; stableKey?: string; isActive?: number } | undefined
    : d
        .prepare(`
          SELECT cv.id, cv.stable_key as stableKey, cv.is_active as isActive
          FROM classification_values cv
          JOIN classification_schemes cs ON cs.id = cv.scheme_id
          WHERE cs.key = ? AND cv.id = ?
        `)
        .get(schemeKey, requestedId) as { id?: number; stableKey?: string; isActive?: number } | undefined

  if (!row?.id) {
    const label = ORGANIZATION_PROFILE_DEFINITIONS[profile].primaryLabel.toLowerCase()
    throw new Error(`Die ausgewählte ${label} ist nicht verfügbar.`)
  }
  if (Number(row.isActive) !== 1) throw new Error('Inaktive Klassifikationen können nicht verwendet werden.')
  if (profile === 'NONPROFIT' && row.stableKey !== input.legacySphere) {
    throw new Error('Sphäre und primäre Klassifikation müssen übereinstimmen.')
  }
  if (profile === 'GENERAL' && requestedId == null) {
    throw new Error('Für allgemeine Organisationen ist eine Kategorie erforderlich.')
  }
  return Number(row.id)
}

export function getOrganizationProfile(): OrganizationProfile {
  return getProfileRow(getDb()).profile
}

export function getOrganizationProfileDefinition() {
  return ORGANIZATION_PROFILE_DEFINITIONS[getOrganizationProfile()]
}

export function listClassificationSchemes(): ClassificationScheme[] {
  const rows = getDb()
    .prepare(`
      SELECT id, key, label, label_plural as labelPlural, description,
             required, is_system as isSystem, is_active as isActive
      FROM classification_schemes
      ORDER BY id
    `)
    .all() as Row[]
  return rows.map(mapScheme)
}

export function getPrimaryClassificationScheme(): ClassificationScheme {
  const definition = getOrganizationProfileDefinition()
  const row = getDb()
    .prepare(`
      SELECT id, key, label, label_plural as labelPlural, description,
             required, is_system as isSystem, is_active as isActive
      FROM classification_schemes
      WHERE key = ?
    `)
    .get(definition.primarySchemeKey) as Row | undefined
  if (!row) throw new Error('Das primäre Klassifikationsschema ist nicht eingerichtet.')
  return mapScheme(row)
}

export function listPrimaryClassificationValues(options: { includeInactive?: boolean } = {}): ClassificationValue[] {
  const scheme = getPrimaryClassificationScheme()
  const rows = getDb()
    .prepare(`
      SELECT id, scheme_id as schemeId, stable_key as stableKey, name, color, icon, description,
             sort_order as sortOrder, is_system as isSystem, is_active as isActive
      FROM classification_values
      WHERE scheme_id = ? ${options.includeInactive ? '' : 'AND is_active = 1'}
      ORDER BY sort_order, name COLLATE NOCASE
    `)
    .all(scheme.id) as Row[]
  return rows.map(mapValue)
}

function hasFinancialData(d: DB) {
  const tables = ['vouchers', 'budgets', 'invoices', 'recurring_bookings', 'submissions']
  return tables.some((table) => {
    const row = d.prepare(`SELECT EXISTS(SELECT 1 FROM ${table} LIMIT 1) as hasRows`).get() as { hasRows?: number }
    return Number(row?.hasRows || 0) === 1
  })
}

/**
 * A profile is a data-model decision, not a visual preference. It can only be
 * changed while the organisation has no financial records.
 */
export function setOrganizationProfile(profile: OrganizationProfile) {
  return withTransaction((d) => {
    const current = getProfileRow(d).profile
    if (current === profile) return { profile, changed: false }
    if (hasFinancialData(d)) {
      throw new Error('Das Organisationsprofil kann nach den ersten Finanzdaten nicht mehr geändert werden.')
    }
    d.prepare("UPDATE organization_profile SET profile = ?, updated_at = datetime('now') WHERE id = 1").run(profile)
    return { profile, changed: true }
  })
}

export function createGeneralClassificationValue(input: {
  name: string
  color?: string | null
  icon?: string | null
  description?: string | null
}) {
  return withTransaction((d) => {
    if (getProfileRow(d).profile !== 'GENERAL') {
      throw new Error('Benutzerdefinierte Hauptkategorien sind nur im allgemeinen Organisationsprofil verfügbar.')
    }
    const name = normalizeCategoryName(input.name)
    const scheme = d
      .prepare('SELECT id FROM classification_schemes WHERE key = ?')
      .get(CLASSIFICATION_SCHEME_KEYS.general) as { id?: number } | undefined
    if (!scheme?.id) throw new Error('Das Kategorie-Schema ist nicht eingerichtet.')
    const duplicate = d
      .prepare('SELECT id FROM classification_values WHERE scheme_id = ? AND lower(name) = lower(?)')
      .get(scheme.id, name)
    if (duplicate) throw new Error('Eine Kategorie mit diesem Namen existiert bereits.')
    const next = d
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as sortOrder FROM classification_values WHERE scheme_id = ?')
      .get(scheme.id) as { sortOrder: number }
    const info = d
      .prepare(`
        INSERT INTO classification_values(scheme_id, stable_key, name, color, icon, description, sort_order, is_system, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
      `)
      .run(scheme.id, `USER_${randomUUID()}`, name, input.color ?? null, input.icon?.trim().slice(0, 8) || null, input.description?.trim() || null, next.sortOrder)
    return { id: Number(info.lastInsertRowid) }
  })
}

export function updateGeneralClassificationValue(input: {
  id: number
  name?: string
  color?: string | null
  icon?: string | null
  description?: string | null
  isActive?: boolean
}) {
  return withTransaction((d) => {
    if (getProfileRow(d).profile !== 'GENERAL') {
      throw new Error('System-Sphären können nicht als allgemeine Kategorie geändert werden.')
    }
    const row = d
      .prepare(`
        SELECT cv.id, cv.is_system as isSystem
        FROM classification_values cv
        JOIN classification_schemes cs ON cs.id = cv.scheme_id
        WHERE cv.id = ? AND cs.key = ?
      `)
      .get(input.id, CLASSIFICATION_SCHEME_KEYS.general) as { id?: number; isSystem?: number } | undefined
    if (!row?.id || Number(row.isSystem) !== 0) throw new Error('Kategorie nicht gefunden.')

    const fields: string[] = ["updated_at = datetime('now')"]
    const values: unknown[] = []
    if (input.name !== undefined) {
      const name = normalizeCategoryName(input.name)
      const duplicate = d
        .prepare(`
          SELECT cv.id
          FROM classification_values cv
          JOIN classification_values current ON current.id = ? AND current.scheme_id = cv.scheme_id
          WHERE lower(cv.name) = lower(?) AND cv.id <> ?
        `)
        .get(input.id, name, input.id)
      if (duplicate) throw new Error('Eine Kategorie mit diesem Namen existiert bereits.')
      fields.push('name = ?')
      values.push(name)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color)
    }
    if (input.icon !== undefined) {
      fields.push('icon = ?')
      values.push(input.icon?.trim().slice(0, 8) || null)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      values.push(input.description?.trim() || null)
    }
    if (input.isActive !== undefined) {
      fields.push('is_active = ?')
      values.push(input.isActive ? 1 : 0)
    }
    values.push(input.id)
    d.prepare(`UPDATE classification_values SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return { id: input.id }
  })
}
