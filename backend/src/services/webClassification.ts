import type { Pool, PoolClient } from 'pg'

export async function addPrimaryClassificationLabels(db: Pool | PoolClient, organizationId: number, rows: Array<Record<string, any>>) {
  const ids = [...new Set(rows.map(row => row.primaryClassificationValueId).filter(id => Number.isInteger(id) && id > 0))]
  if (!ids.length) return rows
  const categories = await db.query("SELECT id, name, data->>'color' AS color FROM web_master_data WHERE organization_id=$1 AND kind='categories' AND id=ANY($2::int[])", [organizationId, ids])
  const byId = new Map(categories.rows.map(row => [row.id, row]))
  return rows.map(row => ({ ...row, primaryClassificationName: byId.get(row.primaryClassificationValueId)?.name || null, primaryClassificationColor: byId.get(row.primaryClassificationValueId)?.color || null }))
}

/** Validate before writing: category IDs must belong to this organization and
 * must actually be categories, rather than another kind of master data. */
export async function savePrimaryClassification(client: PoolClient, organizationId: number,
  table: 'web_bookings' | 'web_drafts', id: number, categoryId: number | null | undefined, sourceDraftId?: number | null, sourceRecurringId?: number | null) {
  if (categoryId === undefined) return
  if (categoryId !== null) {
    await client.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE', [organizationId])
    const category = await client.query(`SELECT m.id FROM web_master_data m
      LEFT JOIN web_organization_profiles p ON p.organization_id=m.organization_id
      WHERE m.id=$1 AND m.organization_id=$2 AND m.kind='categories'
      AND ((p.profile='GENERAL' AND m.is_active)
        OR EXISTS(SELECT 1 FROM ${table} b WHERE b.id=$3 AND b.organization_id=$2 AND b.primary_classification_value_id=m.id)
        OR EXISTS(SELECT 1 FROM web_drafts d WHERE d.id=$4 AND d.organization_id=$2 AND d.primary_classification_value_id=m.id)
        ${sourceRecurringId ? "OR EXISTS(SELECT 1 FROM web_recurring r WHERE r.id=$5 AND r.organization_id=$2 AND (r.data->>'primaryClassificationValueId')::int=m.id)" : ''})
      FOR SHARE OF m`, [categoryId, organizationId, id, sourceDraftId || null, ...(sourceRecurringId ? [sourceRecurringId] : [])])
    if (!category.rowCount) throw Object.assign(new Error('Die Kategorie ist für diese Organisation nicht verfügbar.'), { statusCode: 400 })
  }
  await client.query(`UPDATE ${table} SET primary_classification_value_id=$1 WHERE id=$2 AND organization_id=$3`, [categoryId, id, organizationId])
}
