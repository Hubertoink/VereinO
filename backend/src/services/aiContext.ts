import type { Pool } from 'pg'
import type { SessionUser } from '../middleware/auth.js'

/** Context is assembled from the authenticated session, never caller-selected tenant/user IDs. */
export async function webAiContext(db: Pool, user: SessionUser) {
  const org = user.organizationId
  const profile = (await db.query('SELECT profile FROM web_organization_profiles WHERE organization_id=$1', [org])).rows[0]?.profile || 'NONPROFIT'
  const categories = profile === 'GENERAL' ? (await db.query("SELECT id,name FROM web_master_data WHERE organization_id=$1 AND kind='categories' AND is_active=true ORDER BY id LIMIT 200", [org])).rows : []
  if (user.role === 'USER') {
    const drafts = (await db.query(`SELECT id,date,type,description,gross_amount_cents AS "grossAmountCents",sphere,primary_classification_value_id AS "categoryId",status
      FROM web_drafts WHERE organization_id=$1 AND created_by=$2 ORDER BY date DESC,id DESC LIMIT 50`, [org, user.userId])).rows
    return { profile, categories, role: user.role, scope: 'Nur eigene Entwürfe; kein Zugriff auf gebuchte Einträge anderer Benutzer.', drafts }
  }
  const totals = (await db.query(`SELECT type,count(*)::int AS count,sum(gross_amount_cents)::text AS "amountCents"
    FROM web_bookings WHERE organization_id=$1 GROUP BY type`, [org])).rows
  const bookings = (await db.query(`SELECT id,number,date,type,description,gross_amount_cents AS "grossAmountCents",sphere,primary_classification_value_id AS "categoryId"
    FROM web_bookings WHERE organization_id=$1 ORDER BY date DESC,id DESC LIMIT 100`, [org])).rows
  return { profile, categories, role: user.role, scope: 'Summen aller gebuchten Einträge und die letzten maximal 100 Buchungen. Ältere Einzelbuchungen sind nicht im Kontext.', totals, bookings }
}
