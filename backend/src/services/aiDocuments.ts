import type { PoolClient } from 'pg'
import type { SessionUser } from '../middleware/auth.js'
const unavailable = () => Object.assign(new Error('Der analysierte Beleg ist nicht mehr verfügbar oder bereits zugeordnet. Bitte erneut analysieren.'), { statusCode: 409 })
/** Called inside the entry transaction, so file binding and entry creation commit together. */
export async function bindAiDocument(client: PoolClient, user: SessionUser, token: string | undefined, target: { draftId: number } | { bookingId: number; sourceDraftId: number | null }) {
 if (!token) return
 const file = (await client.query('SELECT * FROM web_ai_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [token,user.organizationId])).rows[0]
 if (!file || file.booking_id) throw unavailable()
 const sourceDraft = 'bookingId' in target ? target.sourceDraftId : null
 if (sourceDraft) {
  if (file.draft_id !== sourceDraft) throw unavailable()
 } else if (file.uploaded_by !== user.userId || file.draft_id || new Date(file.created_at).getTime() < Date.now()-86400000) throw unavailable()
 if ('draftId' in target) {
  await client.query('UPDATE web_ai_documents SET draft_id=$1 WHERE id=$2',[target.draftId,token])
  await client.query('UPDATE web_drafts SET ai_document_id=$1 WHERE id=$2 AND organization_id=$3',[token,target.draftId,user.organizationId])
 } else {
  await client.query('INSERT INTO web_attachments(id,organization_id,booking_id,uploaded_by,file_name,mime_type,size,data,draft_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[token,user.organizationId,target.bookingId,file.uploaded_by,file.file_name,file.mime_type,file.size,file.data,sourceDraft])
  await client.query('UPDATE web_ai_documents SET booking_id=$1 WHERE id=$2',[target.bookingId,token])
 }
}
