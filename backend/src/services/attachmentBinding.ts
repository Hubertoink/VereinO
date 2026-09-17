import type { PoolClient } from 'pg'
import type { SessionUser } from '../middleware/auth.js'

// Entry creation and attachment binding share a transaction. Failed saves leave the
// owner's staged uploads available for retry without creating a duplicate entry.
export async function bindAttachments(client: PoolClient, user: SessionUser, ids: string[] | undefined, target: { bookingId?: number; draftId?: number }) {
  for (const id of [...new Set(ids || [])].sort()) {
    const file = (await client.query('SELECT id FROM web_attachments WHERE id=$1 AND organization_id=$2 AND uploaded_by=$3 AND booking_id IS NULL AND draft_id IS NULL FOR UPDATE', [id, user.organizationId, user.userId])).rows[0]
    if (!file) throw Object.assign(new Error('Anhang ist nicht mehr verfügbar oder bereits zugeordnet.'), { statusCode: 409 })
    await client.query('UPDATE web_attachments SET booking_id=$1,draft_id=$2 WHERE id=$3', [target.bookingId || null, target.draftId || null, id])
  }
}
