import { bindAttachments } from '../services/attachmentBinding.js'
import { bindAiDocument } from '../services/aiDocuments.js'
import { FastifyPluginAsync } from 'fastify'
import { PoolClient } from 'pg'
import { z } from 'zod'
import { assignmentAmount, assignmentFields, saveBookingAssignments, readBookingAssignments, type BookingAssignments } from '../services/planning.js'
import { getDatabase } from '../config/database.js'
import { AuthenticatedRequest, requireRoles } from '../middleware/auth.js'
import { savePrimaryClassification, addPrimaryClassificationLabels } from '../services/webClassification.js'

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= '1900-01-01' &&
      value <= '9999-12-31'
    )
  }, 'Ungültiges Datum')
export const bookingFields = z
  .object({
    type: z.enum(['IN', 'OUT']),
    date,
    description: z.string().trim().min(1).max(2000),
    grossAmountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sphere: z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']),
    paymentMethod: z.enum(['BANK', 'CASH']),
    primaryClassificationValueId: z.number().int().positive().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(200)).max(32).optional(),
    counterparty: z.string().trim().max(255).nullable().optional()
  })
  .strict()
const attachmentFields = { attachmentIds: z.array(z.string().uuid()).max(20).optional() }
const createDraftFields = bookingFields.extend({ ...attachmentFields, ...assignmentFields, aiDocumentId: z.string().uuid().optional() }).strict()
const postedFields = bookingFields.extend({ ...assignmentFields, ...attachmentFields }).strict()
const createPostedFields = postedFields.extend({ aiDocumentId: z.string().uuid().optional() }).strict()
const postedPatchBody = postedFields.partial().extend({ version: z.number().int().positive() }).strict()
const versionBody = z.object({ version: z.number().int().positive() }).strict()
const patchBody = bookingFields.partial().extend({ ...assignmentFields, ...attachmentFields, version: z.number().int().positive() }).strict()
type Fields = z.infer<typeof bookingFields>
type Actor = AuthenticatedRequest['user']
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode })
}
function idOf(request: AuthenticatedRequest) {
  return z.coerce
    .number()
    .int()
    .positive()
    .parse((request.params as { id: string }).id)
}
function json(row: Record<string, any>) {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(row))
    result[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value
  if (result.date instanceof Date) result.date = result.date.toISOString().slice(0, 10)
  result.grossAmountCents = Number(result.grossAmountCents)
  if (result.fileCount != null) result.fileCount = Number(result.fileCount)
  if (Array.isArray(result.budgetAssignments)) {
    result.budgets = result.budgetAssignments
    delete result.budgetAssignments
  }
  if (Array.isArray(result.earmarkAssignments)) {
    result.earmarksAssigned = result.earmarkAssignments
    delete result.earmarkAssignments
  }
  delete result.organizationId
  return result
}
async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await getDatabase().connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
async function audit(
  client: PoolClient,
  user: Actor,
  action: string,
  table: string,
  id: number,
  changes: unknown
) {
  await client.query(
    `INSERT INTO audit_log (organization_id,user_id,action,entity_type,entity_id,changes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [user.organizationId, user.userId, action, table, id, JSON.stringify(changes)]
  )
}
async function read(
  client: PoolClient,
  table: 'web_drafts' | 'web_bookings',
  id: number,
  user: Actor,
  lock = false
) {
  const result = await client.query(
    `SELECT t.*, t.date::text AS date, u.email AS created_by_email FROM ${table} t JOIN users u ON u.id=t.created_by WHERE t.id=$1 AND t.organization_id=$2 ${lock ? 'FOR UPDATE OF t' : ''}`,
    [id, user.organizationId]
  )
  const row = result.rows[0]
  if (!row || (table === 'web_drafts' && user.role === 'USER' && row.created_by !== user.userId))
    fail(404, 'Eintrag nicht gefunden')
  if (table === 'web_bookings') Object.assign(row, (await readBookingAssignments(client, user.organizationId, [id]))[id])
  else {
    row.budgets = Array.isArray(row.budget_assignments) ? row.budget_assignments : []
    row.earmarksAssigned = Array.isArray(row.earmark_assignments) ? row.earmark_assignments : []
    delete row.budget_assignments
    delete row.earmark_assignments
  }
  return row
}
function checkVersion(row: Record<string, any>, version: number) {
  if (row.version !== version) fail(409, 'Der Eintrag wurde inzwischen geändert. Bitte neu laden.')
}
function values(body: Fields) {
  return [
    body.type,
    body.date,
    body.description,
    body.grossAmountCents,
    body.sphere,
    body.paymentMethod,
    body.counterparty || null
  ]
}
async function saveTags(client: PoolClient, user: Actor, table: 'web_drafts' | 'web_bookings', id: number, input?: string[]) {
  if (input === undefined) return
  const tags: string[] = []
  for (const name of input) {
    const existing = await client.query("SELECT name FROM web_master_data WHERE organization_id=$1 AND kind='tags' AND lower(name)=lower($2)", [user.organizationId, name])
    let canonical = existing.rows[0]?.name || name
    if (!existing.rows.length && table === 'web_bookings') {
      const created = await client.query("INSERT INTO web_master_data(organization_id,kind,name) VALUES($1,'tags',$2) ON CONFLICT DO NOTHING RETURNING id", [user.organizationId,name])
      if (created.rowCount) await audit(client,user,'CREATE','web_master_tags',created.rows[0].id,{after:{name}})
      else canonical = (await client.query("SELECT name FROM web_master_data WHERE organization_id=$1 AND kind='tags' AND lower(name)=lower($2)", [user.organizationId,name])).rows[0].name
    }
    if (!tags.some(tag => tag.toLowerCase() === canonical.toLowerCase())) tags.push(canonical)
  }
  await client.query(`UPDATE ${table} SET tags=$1 WHERE id=$2 AND organization_id=$3`, [tags,id,user.organizationId])
}
async function saveDraftAssignments(client: PoolClient, user: Actor, id: number, input: BookingAssignments, booking: { date: string; grossAmountCents: number }) {
  const parsed = z.object(assignmentFields).parse(input)
  for (const kind of ['budgets', 'earmarksAssigned'] as const) {
    const requested = parsed[kind]
    if (requested === undefined) continue
    const isBudget = kind === 'budgets'
    const definitions = isBudget ? 'web_budgets' : 'web_earmarks'
    const idKey = isBudget ? 'budgetId' : 'earmarkId'
    const rows = requested.map(item => ({ id: Number((item as any)[idKey]), cents: Math.round(Number(item.amount) * 100) }))
    if (new Set(rows.map(row => row.id)).size !== rows.length) fail(400, 'Zuordnungen dürfen nicht doppelt vorkommen.')
    const sum = rows.reduce((total, row) => total + row.cents, 0)
    if (sum > booking.grossAmountCents) fail(400, 'Zuordnungssumme übersteigt den Buchungsbetrag.')
    for (const row of rows) {
      if (!Number.isSafeInteger(row.cents) || !assignmentAmount.safeParse(row.cents / 100).success) fail(400, 'Ungültiger Zuordnungsbetrag.')
      const result = await client.query(`SELECT *,start_date::text AS start_date,end_date::text AS end_date FROM ${definitions} WHERE id=$1 AND organization_id=$2 FOR SHARE`, [row.id, user.organizationId])
      const definition = result.rows[0]
      if (!definition) fail(404, 'Zuordnung nicht gefunden.')
      if (isBudget ? definition.is_archived : !definition.is_active) fail(400, 'Archivierte Zuordnungen können nicht vergeben werden.')
      const start = definition.start_date || (isBudget ? `${definition.year}-01-01` : null)
      const end = definition.end_date || (isBudget ? `${definition.year}-12-31` : null)
      if (definition.enforce_time_range && ((start && booking.date < start) || (end && booking.date > end))) fail(400, 'Buchungsdatum liegt außerhalb des Zuordnungszeitraums.')
    }
    const column = isBudget ? 'budget_assignments' : 'earmark_assignments'
    await client.query(`UPDATE web_drafts SET ${column}=$1::jsonb WHERE id=$2 AND organization_id=$3`, [JSON.stringify(requested), id, user.organizationId])
  }
}
export async function insertBooking(
  client: PoolClient,
  user: Actor,
  body: Fields & BookingAssignments & { aiDocumentId?: string; attachmentIds?: string[] },
  sourceDraftId: number | null,
  sourceRecurringId?: number
) {
  const year = Number(body.date.slice(0, 4))
  const sequence = await client.query(
    `INSERT INTO web_booking_sequences (organization_id,year,last_number) VALUES ($1,$2,1) ON CONFLICT (organization_id,year) DO UPDATE SET last_number=web_booking_sequences.last_number+1 RETURNING last_number`,
    [user.organizationId, year]
  )
  const number = `${year}-${String(sequence.rows[0].last_number).padStart(6, '0')}`
  const result = await client.query(
    `INSERT INTO web_bookings (organization_id,created_by,type,date,description,gross_amount_cents,sphere,payment_method,counterparty,number,source_draft_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [user.organizationId, user.userId, ...values(body), number, sourceDraftId]
  )
  await bindAttachments(client, user, body.attachmentIds, { bookingId: result.rows[0].id })
  if (sourceDraftId) await client.query('UPDATE web_attachments SET booking_id=$1 WHERE draft_id=$2 AND organization_id=$3', [result.rows[0].id, sourceDraftId, user.organizationId])
  await saveTags(client, user, 'web_bookings', result.rows[0].id, body.tags)
  await saveBookingAssignments(client, user.organizationId, result.rows[0].id, body, body)
  await savePrimaryClassification(client, user.organizationId, 'web_bookings', result.rows[0].id, body.primaryClassificationValueId, sourceDraftId, sourceRecurringId)
  await bindAiDocument(client, user, body.aiDocumentId, { bookingId: result.rows[0].id, sourceDraftId })
  const row = await read(client, 'web_bookings', result.rows[0].id, user)
  await audit(client, user, 'CREATE', 'web_bookings', row.id, { after: json(row) })
  return json(row)
}
const workflowRoutes: FastifyPluginAsync = async (app) => {
  const signedIn = { onRequest: [app.authenticate] }
  const reviewers = { onRequest: [app.authenticate, requireRoles('ADMIN', 'EDITOR')] }
  app.get('/tags', signedIn, async request => ({ rows: (await getDatabase().query("SELECT id,name,data->>'color' AS color FROM web_master_data WHERE organization_id=$1 AND kind='tags' AND is_active=TRUE ORDER BY lower(name),id", [request.user.organizationId])).rows }))
  app.get('/drafts', signedIn, async (request: AuthenticatedRequest) => {
    const user = request.user
    const rows = await getDatabase().query(
      `SELECT d.*,d.date::text AS date,u.email AS created_by_email,(SELECT count(*) FROM web_attachments a WHERE a.draft_id=d.id AND a.organization_id=d.organization_id) + CASE WHEN EXISTS(SELECT 1 FROM web_ai_documents ai WHERE ai.id=d.ai_document_id AND ai.booking_id IS NULL) AND NOT EXISTS(SELECT 1 FROM web_attachments a WHERE a.id=d.ai_document_id) THEN 1 ELSE 0 END AS file_count FROM web_drafts d JOIN users u ON u.id=d.created_by WHERE d.organization_id=$1 AND ($2::integer IS NULL OR d.created_by=$2) ORDER BY d.created_at DESC,d.id DESC`,
      [user.organizationId, user.role === 'USER' ? user.userId : null]
    )
    return { drafts: await addPrimaryClassificationLabels(getDatabase(), user.organizationId, rows.rows.map(json)) }
  })
  app.post('/drafts', signedIn, async (request: AuthenticatedRequest, reply) => {
    const body = createDraftFields.parse(request.body),
      user = request.user
    const draft = await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO web_drafts (organization_id,created_by,type,date,description,gross_amount_cents,sphere,payment_method,counterparty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [user.organizationId, user.userId, ...values(body)]
      )
      await saveDraftAssignments(client, user, inserted.rows[0].id, body, body)
      await bindAttachments(client, user, body.attachmentIds, { draftId: inserted.rows[0].id })
      await saveTags(client, user, 'web_drafts', inserted.rows[0].id, body.tags)
      await savePrimaryClassification(client, user.organizationId, 'web_drafts', inserted.rows[0].id, body.primaryClassificationValueId)
      await bindAiDocument(client, user, body.aiDocumentId, { draftId: inserted.rows[0].id })
      const row = await read(client, 'web_drafts', inserted.rows[0].id, user)
      await audit(client, user, 'CREATE', 'web_drafts', row.id, { after: json(row) })
      return json(row)
    })
    return reply.code(201).send({ draft })
  })
  app.patch('/drafts/:id', signedIn, async (request: AuthenticatedRequest) => {
    const id = idOf(request),
      body = patchBody.parse(request.body),
      user = request.user
    return transaction(async (client) => {
      const row = await read(client, 'web_drafts', id, user, true)
      checkVersion(row, body.version)
      const canReview = user.role === 'ADMIN' || user.role === 'EDITOR'
      if (!canReview && row.created_by !== user.userId)
        fail(403, 'Nur eigene Entwürfe dürfen bearbeitet werden')
      if (!(canReview ? ['DRAFT', 'RETURNED', 'SUBMITTED'] : ['DRAFT', 'RETURNED']).includes(row.status))
        fail(409, 'Dieser Entwurf ist zur Bearbeitung gesperrt')
      const merged = { ...json(row), ...body } as Fields
      await client.query(
        `UPDATE web_drafts SET type=$1,date=$2,description=$3,gross_amount_cents=$4,sphere=$5,payment_method=$6,counterparty=$7,version=version+1,updated_at=now() WHERE id=$8`,
        [...values(merged), id]
      )
      await saveDraftAssignments(client, user, id, body, merged)
      await bindAttachments(client, user, body.attachmentIds, { draftId: id })
      await saveTags(client, user, 'web_drafts', id, body.tags)
      await savePrimaryClassification(client, user.organizationId, 'web_drafts', id, body.primaryClassificationValueId)
      const after = json(await read(client, 'web_drafts', id, user))
      await audit(client, user, 'UPDATE', 'web_drafts', id, { before: json(row), after })
      return { draft: (await addPrimaryClassificationLabels(client, user.organizationId, [after]))[0] }
    })
  })
  for (const action of ['submit', 'return', 'approve'] as const) {
    app.post(
      `/drafts/:id/${action}`,
      action === 'submit' ? signedIn : reviewers,
      async (request: AuthenticatedRequest) => {
        const body = (
          action === 'return'
            ? versionBody.extend({ reason: z.string().trim().min(1).max(2000) }).strict()
            : versionBody
        ).parse(request.body)
        const id = idOf(request),
          user = request.user
        return transaction(async (client) => {
          const row = await read(client, 'web_drafts', id, user, true)
          checkVersion(row, body.version)
          if (action === 'submit') {
            if (row.created_by !== user.userId && user.role !== 'ADMIN')
              fail(403, 'Nur eigene Entwürfe dürfen eingereicht werden')
            if (!['DRAFT', 'RETURNED'].includes(row.status))
              fail(409, 'Entwurf kann nicht eingereicht werden')
          } else if (!['DRAFT', 'RETURNED', 'SUBMITTED'].includes(row.status))
            fail(409, 'Dieser Entwurf kann nicht mehr geprüft werden')
          const booking =
            action === 'approve'
              ? await insertBooking(client, user, json(row) as Fields, id)
              : undefined
          const status =
            action === 'submit' ? 'SUBMITTED' : action === 'return' ? 'RETURNED' : 'APPROVED'
          await client.query(
            `UPDATE web_drafts SET status=$1,review_reason=$2,version=version+1,updated_at=now() WHERE id=$3`,
            [status, 'reason' in body ? body.reason : null, id]
          )
          const after = json(await read(client, 'web_drafts', id, user))
          await audit(client, user, action.toUpperCase(), 'web_drafts', id, {
            before: json(row),
            after,
            bookingId: booking?.id
          })
          return booking ? { booking } : { draft: after }
        })
      }
    )
  }
  app.get('/bookings', reviewers, async (request: AuthenticatedRequest) => {
    const rows = await getDatabase().query(
      `SELECT b.*,b.date::text AS date,u.email AS created_by_email,(SELECT count(*) FROM web_attachments a WHERE a.booking_id=b.id AND a.organization_id=b.organization_id) AS file_count FROM web_bookings b JOIN users u ON u.id=b.created_by WHERE b.organization_id=$1 ORDER BY b.date DESC,b.id DESC`,
      [request.user.organizationId]
    )
    const assignments = await readBookingAssignments(getDatabase(), request.user.organizationId, rows.rows.map(row => row.id))
    return { bookings: await addPrimaryClassificationLabels(getDatabase(), request.user.organizationId, rows.rows.map(row => ({ ...json(row), ...assignments[row.id] }))) }
  })
  app.post('/bookings', reviewers, async (request: AuthenticatedRequest, reply) => {
    const body = createPostedFields.parse(request.body)
    const booking = await transaction((client) => insertBooking(client, request.user, body, null))
    return reply.code(201).send({ booking })
  })
  app.patch(
    '/bookings/:id',
    { onRequest: [app.authenticate, requireRoles('ADMIN')] },
    async (request: AuthenticatedRequest) => {
      const id = idOf(request),
        body = postedPatchBody.parse(request.body),
        user = request.user
      return transaction(async (client) => {
        const row = await read(client, 'web_bookings', id, user, true)
        checkVersion(row, body.version)
        // Keep the issued reference stable; dates may be corrected without renumbering.
        await client.query(
          `UPDATE web_bookings SET type=$1,date=$2,description=$3,gross_amount_cents=$4,sphere=$5,payment_method=$6,counterparty=$7,version=version+1,updated_at=now() WHERE id=$8`,
          [...values({ ...json(row), ...body } as Fields), id]
        )
        await bindAttachments(client, user, body.attachmentIds, { bookingId: id })
        await saveTags(client, user, 'web_bookings', id, body.tags)
        await saveBookingAssignments(client, user.organizationId, id, body, { ...json(row), ...body } as Fields)
        await savePrimaryClassification(client, user.organizationId, 'web_bookings', id, body.primaryClassificationValueId)
        const after = json(await read(client, 'web_bookings', id, user))
        await audit(client, user, 'UPDATE', 'web_bookings', id, { before: json(row), after })
        return { booking: after }
      })
    }
  )
}
export default workflowRoutes
