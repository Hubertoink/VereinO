import type { FastifyPluginAsync } from 'fastify'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import type { SessionUser } from '../middleware/auth.js'
import { MAX_ATTACHMENT_SIZE, validateAttachment } from '../services/attachments.js'

const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }) }
const entryId = (params: unknown) => z.object({ id: z.coerce.number().int().positive() }).parse(params).id
const fileId = (params: unknown) => z.object({ id: z.string().uuid() }).parse(params).id
type Kind = 'bookings' | 'drafts'
type Db = Pick<PoolClient, 'query'>
async function permissions(db: Db, user: SessionUser, kind: Kind, id: number, lock = false) {
  if (kind === 'bookings' && user.role === 'USER') fail(403, 'Keine Berechtigung.')
  const row = (await db.query(`SELECT * FROM ${kind === 'drafts' ? 'web_drafts' : 'web_bookings'} WHERE id=$1 AND organization_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [id, user.organizationId])).rows[0]
  if (!row || (kind === 'drafts' && user.role === 'USER' && row.created_by !== user.userId)) fail(404, 'Eintrag nicht gefunden.')
  const editable = kind === 'drafts'
    ? (user.role === 'USER' ? ['DRAFT', 'RETURNED'] : ['DRAFT', 'RETURNED', 'SUBMITTED']).includes(row.status)
    : user.role === 'ADMIN' || row.created_by === user.userId
  return { canUpload: editable, canDelete: kind === 'drafts' ? editable : user.role === 'ADMIN' }
}
async function getFile(db: Db, user: SessionUser, id: string) {
  const stored = (await db.query('SELECT *,false AS ai FROM web_attachments WHERE id=$1 AND organization_id=$2', [id, user.organizationId])).rows[0]
  const file = stored || (await db.query('SELECT *,true AS ai FROM web_ai_documents WHERE id=$1 AND organization_id=$2 AND draft_id IS NOT NULL AND booking_id IS NULL', [id, user.organizationId])).rows[0]
  if (!file) fail(404, 'Datei nicht gefunden.')
  if (file.draft_id) await permissions(db, user, 'drafts', file.draft_id)
  else if (file.booking_id) await permissions(db, user, 'bookings', file.booking_id)
  else if (file.uploaded_by !== user.userId) fail(404, 'Datei nicht gefunden.')
  return file
}
const attachmentRoutes: FastifyPluginAsync = async app => {
  app.addHook('preHandler', app.authenticate)
  for (const kind of ['bookings', 'drafts'] as const) {
    app.get(`/${kind}/:id/attachments`, async request => {
      const user = request.user, id = entryId(request.params), db = getDatabase()
      const access = await permissions(db, user, kind, id)
      const column = kind === 'drafts' ? 'draft_id' : 'booking_id'
      const result = await db.query(`SELECT id,file_name AS "fileName",mime_type AS "mimeType",size,created_at AS "createdAt" FROM web_attachments WHERE ${column}=$1 AND organization_id=$2 ORDER BY created_at,id`, [id, user.organizationId])
      if (kind === 'drafts') {
        const ai = await db.query('SELECT id,file_name AS "fileName",mime_type AS "mimeType",size,created_at AS "createdAt" FROM web_ai_documents WHERE draft_id=$1 AND organization_id=$2 AND booking_id IS NULL AND id NOT IN (SELECT id FROM web_attachments WHERE organization_id=$2)', [id, user.organizationId])
        result.rows.push(...ai.rows)
      }
      return { files: result.rows, ...access }
    })
  }
  // Uploads for a new entry are staged under the current owner and bound by its save transaction.
  for (const kind of ['bookings', 'drafts', 'staged'] as const) {
    app.post(kind === 'staged' ? '/attachments/staged' : `/${kind}/:id/attachments`, { bodyLimit: MAX_ATTACHMENT_SIZE + 65536 }, async (request, reply) => {
      const user = request.user, id = kind === 'staged' ? null : entryId(request.params)
      if (kind !== 'staged' && !(await permissions(getDatabase(), user, kind, id!)).canUpload) fail(403, 'Der Eintrag ist für Anhänge gesperrt.')
      const part = await request.file({ limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 0 } })
      if (!part) return fail(400, 'Bitte eine Datei auswählen.')
      const data = await part.toBuffer()
      if (part.file.truncated) fail(413, 'Datei ist größer als 10 MB.')
      const validated = await validateAttachment(data, part.filename, part.mimetype)
      const client = await getDatabase().connect()
      try {
        await client.query('BEGIN')
        if (kind === 'staged') await client.query("DELETE FROM web_attachments WHERE organization_id=$1 AND uploaded_by=$2 AND booking_id IS NULL AND draft_id IS NULL AND created_at < now()-interval '24 hours'", [user.organizationId,user.userId])
        if (kind !== 'staged' && !(await permissions(client, user, kind, id!, true)).canUpload) fail(403, 'Der Eintrag ist für Anhänge gesperrt.')
        const uuid = randomUUID()
        const result = await client.query('INSERT INTO web_attachments(id,organization_id,booking_id,draft_id,uploaded_by,file_name,mime_type,size,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,file_name AS "fileName",mime_type AS "mimeType",size,created_at AS "createdAt"', [uuid,user.organizationId,kind === 'bookings' ? id : null,kind === 'drafts' ? id : null,user.userId,validated.fileName,validated.mimeType,data.length,data])
        await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)', [user.organizationId,user.userId,'CREATE','web_attachments',id,JSON.stringify({ fileId: uuid, fileName: validated.fileName, target: kind })])
        await client.query('COMMIT')
        return reply.code(201).send({ file: result.rows[0] })
      } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
    })
  }
  app.get('/attachments/:id/content', async (request, reply) => {
    const file = await getFile(getDatabase(), request.user, fileId(request.params))
    reply.header('content-type',file.mime_type).header('content-length',file.size).header('content-disposition',`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.file_name).replace(/'/g,'%27')}`).header('content-security-policy',"sandbox; default-src 'none'").header('x-content-type-options','nosniff')
    return reply.send(file.data)
  })
  app.delete('/attachments/:id', async request => {
    const user = request.user, id = fileId(request.params), client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const file = await getFile(client, user, id)
      // Lock the parent before the file, like approval/binding, to serialize approval and deletion.
      if (file.booking_id) {
        if (!(await permissions(client,user,'bookings',file.booking_id,true)).canDelete) fail(403,'Keine Berechtigung.')
      } else if (file.draft_id && !(await permissions(client,user,'drafts',file.draft_id,true)).canDelete) fail(403,'Der Entwurf ist für Änderungen gesperrt.')
      const current = await getFile(client, user, id)
      if (current.booking_id && !file.booking_id) fail(409, 'Der Entwurf wurde inzwischen übernommen. Bitte neu laden.')
      if (file.ai) {
        await client.query('UPDATE web_drafts SET ai_document_id=NULL WHERE id=$1 AND organization_id=$2', [file.draft_id,user.organizationId])
        await client.query('DELETE FROM web_ai_documents WHERE id=$1 AND organization_id=$2', [id,user.organizationId])
      } else {
        const deleted = await client.query('DELETE FROM web_attachments WHERE id=$1 AND organization_id=$2 AND booking_id IS NOT DISTINCT FROM $3 AND draft_id IS NOT DISTINCT FROM $4 RETURNING id', [id,user.organizationId,file.booking_id,file.draft_id])
        if (!deleted.rowCount) fail(409, 'Der Anhang wurde inzwischen geändert. Bitte neu laden.')
      }
      await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)', [user.organizationId,user.userId,'DELETE','web_attachments',file.booking_id || file.draft_id,JSON.stringify({fileId:id,fileName:file.file_name})])
      await client.query('COMMIT')
      return { ok: true }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  })
}
export default attachmentRoutes
