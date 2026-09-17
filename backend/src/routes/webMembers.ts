import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { requireRoles } from '../middleware/auth.js'

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '1900-01-01'
}, 'Ungültiges Datum')
export const memberFields = z.object({
  memberNo: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(255),
  status: z.enum(['ACTIVE','NEW','PAUSED','LEFT']).default('ACTIVE'),
  boardRole: z.enum(['V1','V2','KASSIER','KASSENPR1','KASSENPR2','SCHRIFT']).nullable().optional(),
  email: z.union([z.string().trim().email().max(255), z.literal('')]).nullable().optional(),
  phone: nullableText(100), address: nullableText(1000), notes: nullableText(10000),
  iban: nullableText(40), bic: nullableText(11), mandate_ref: nullableText(100),
  contribution_amount: z.number().nonnegative().max(999999999).refine(value => Math.abs(value - Math.round(value * 100) / 100) < 1e-9).nullable().optional(),
  contribution_interval: z.enum(['MONTHLY','QUARTERLY','YEARLY']).nullable().optional(),
  join_date: date, leave_date: date.nullable().optional(), mandate_date: date.nullable().optional(), next_due_date: date.nullable().optional()
}).strict()
const version = z.number().int().positive()
const listQuery = z.object({
  q: z.string().max(500).optional(), status: z.enum(['ALL','ACTIVE','NEW','PAUSED','LEFT']).default('ALL'),
  intervalFilter: z.enum(['ALL','MONTHLY','QUARTERLY','YEARLY']).default('ALL'),
  contributionFilter: z.enum(['ALL','NO_PLAN']).default('ALL'),
  boardFilter: z.enum(['ALL','ANY','NONE','V1','V2','KASSIER','KASSENPR1','KASSENPR2','SCHRIFT']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(500).default(50), offset: z.coerce.number().int().nonnegative().default(0),
  sortBy: z.enum(['memberNo','name','email','status']).default('name'), sort: z.enum(['ASC','DESC']).default('ASC')
}).strict()
function output(row: Record<string, any>) {
  return { ...row.data, id: row.id, memberNo: row.member_no, name: row.name, status: row.status, boardRole: row.board_role, version: row.version }
}
function fail(statusCode: number, message: string): never { throw Object.assign(new Error(message), { statusCode }) }
const webMembersRoutes: FastifyPluginAsync = async app => {
  const read = { onRequest: requireRoles('ADMIN','EDITOR') }
  const write = { onRequest: requireRoles('ADMIN') }
  app.get('/members', read, async request => {
    const query = listQuery.parse(request.query)
    const values: unknown[] = [request.user.organizationId]
    const where = ['organization_id=$1']
    const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
    if (query.status !== 'ALL') where.push(`status=${bind(query.status)}`)
    if (query.q) {
      const term = bind(`%${query.q.replace(/[\\%_]/g, '\\$&')}%`)
      where.push(`(name ILIKE ${term} OR member_no ILIKE ${term} OR data->>'email' ILIKE ${term} OR data->>'phone' ILIKE ${term})`)
    }
    if (query.intervalFilter !== 'ALL') where.push(`data->>'contribution_interval'=${bind(query.intervalFilter)}`)
    if (query.contributionFilter === 'NO_PLAN') where.push(`(data->>'contribution_interval' IS NULL OR data->>'contribution_amount' IS NULL)`)
    if (query.boardFilter === 'ANY') where.push('board_role IS NOT NULL')
    else if (query.boardFilter === 'NONE') where.push('board_role IS NULL')
    else if (query.boardFilter !== 'ALL') where.push(`board_role=${bind(query.boardFilter)}`)
    const condition = where.join(' AND ')
    const order = { memberNo:'member_no',name:'name',email:"data->>'email'",status:'status' }[query.sortBy]
    const db = getDatabase()
    const count = await db.query(`SELECT count(*) FROM web_members WHERE ${condition}`, values)
    const rows = await db.query(`SELECT * FROM web_members WHERE ${condition} ORDER BY ${order} ${query.sort},id ASC LIMIT ${bind(query.limit)} OFFSET ${bind(query.offset)}`, values)
    return { rows: rows.rows.map(output), total: Number(count.rows[0].count) }
  })
  app.get('/members/:id', read, async request => {
    const id = z.coerce.number().int().positive().parse((request.params as {id:string}).id)
    const result = await getDatabase().query('SELECT * FROM web_members WHERE id=$1 AND organization_id=$2',[id,request.user.organizationId])
    if (!result.rowCount) fail(404,'Mitglied nicht gefunden.')
    return output(result.rows[0])
  })
  for (const method of ['POST','PATCH','DELETE'] as const) app.route({
    method, url: method === 'POST' ? '/members' : '/members/:id', ...write,
    handler: async (request,reply) => {
      const id = method === 'POST' ? null : z.coerce.number().int().positive().parse((request.params as {id:string}).id)
      const body = method === 'DELETE' ? z.object({version}).strict().parse(request.body)
        : method === 'POST' ? memberFields.parse(request.body)
        : memberFields.extend({version}).parse(request.body)
      const db = await getDatabase().connect()
      try {
        await db.query('BEGIN')
        let before: Record<string,any> | null = null
        if (id) {
          const existing = await db.query('SELECT * FROM web_members WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,request.user.organizationId])
          if (!existing.rowCount) fail(404,'Mitglied nicht gefunden.')
          const current = output(existing.rows[0])
          before = current
          if (current.version !== (body as {version:number}).version) fail(409,'Das Mitglied wurde inzwischen geändert. Bitte neu laden.')
        }
        let after: Record<string,any> | null = null
        if (method === 'DELETE') await db.query('DELETE FROM web_members WHERE id=$1 AND organization_id=$2',[id,request.user.organizationId])
        else {
          const {memberNo,name,status,boardRole,...data} = memberFields.parse(method === 'PATCH' ? Object.fromEntries(Object.entries(body).filter(([key])=>key !== 'version')) : body)
          const values = [request.user.organizationId,memberNo,name,status,boardRole || null,JSON.stringify(data)]
          const result = method === 'POST'
            ? await db.query('INSERT INTO web_members(organization_id,member_no,name,status,board_role,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',values)
            : await db.query('UPDATE web_members SET member_no=$2,name=$3,status=$4,board_role=$5,data=$6,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$7 RETURNING *',[...values,id])
          after = output(result.rows[0])
        }
        await db.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[request.user.organizationId,request.user.userId,method === 'POST' ? 'CREATE' : method === 'PATCH' ? 'UPDATE' : 'DELETE','web_members',id || after!.id,JSON.stringify({before,after})])
        await db.query('COMMIT')
        return reply.code(method === 'POST' ? 201 : 200).send(after || {success:true})
      } catch (error: any) {
        await db.query('ROLLBACK')
        if (error.code === '23505') fail(409,'Mitgliedsnummer oder Vorstandsfunktion ist bereits vergeben.')
        throw error
      } finally { db.release() }
    }
  })
}
export default webMembersRoutes
