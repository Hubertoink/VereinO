import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { AuthenticatedRequest, requireRoles } from '../middleware/auth.js'

const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }) }
const idSchema = z.coerce.number().int().positive()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v }, 'Ungültiges Datum').nullable().optional()
const money = z.number().nonnegative().max(Number.MAX_SAFE_INTEGER / 100).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Höchstens zwei Nachkommastellen')
const nullableText = z.string().trim().max(2000).nullable().optional()
const common = { name: z.string().trim().min(1).max(255), startDate: date, endDate: date, color: z.string().regex(/^#[\da-fA-F]{6}$/).nullable().optional(), enforceTimeRange: z.boolean().optional() }
const budgetSchema = z.object({ ...common, year: z.number().int().min(1900).max(9999), sphere: z.enum(['IDEELL','ZWECK','VERMOEGEN','WGB']), amountPlanned: money, categoryName: nullableText, projectName: nullableText, isArchived: z.boolean().optional(), categoryId: z.null().optional(), projectId: z.null().optional(), earmarkId: z.null().optional(), primaryClassificationValueId: z.null().optional() }).strict()
const earmarkSchema = z.object({ ...common, code: z.string().trim().min(1).max(100), description: nullableText, budget: money.nullable().optional(), isActive: z.boolean().optional() }).strict()
export function planningRow(row: Record<string, any>, budget: boolean) {
  const common = { id: row.id, name: row.name, startDate: row.start_date, endDate: row.end_date, color: row.color, enforceTimeRange: Number(row.enforce_time_range), version: row.version }
  return budget ? { ...common, year: row.year, sphere: row.sphere, amountPlanned: Number(row.amount_planned_cents) / 100, categoryName: row.category_name, projectName: row.project_name, categoryId: null, projectId: null, earmarkId: null, isArchived: Number(row.is_archived) } : { ...common, code: row.code, description: row.description, budget: row.budget_cents == null ? null : Number(row.budget_cents) / 100, isActive: Number(row.is_active) }
}
const planningRoutes: FastifyPluginAsync = async app => {
  app.addHook('preHandler', app.authenticate)
  app.get('/planning/options', async request => {
    const user = (request as AuthenticatedRequest).user
    const [budgets, earmarks] = await Promise.all([
      getDatabase().query(`SELECT *,start_date::text AS start_date,end_date::text AS end_date FROM web_budgets WHERE organization_id=$1 AND is_archived=FALSE ORDER BY name,id`, [user.organizationId]),
      getDatabase().query(`SELECT *,start_date::text AS start_date,end_date::text AS end_date FROM web_earmarks WHERE organization_id=$1 AND is_active=TRUE ORDER BY name,id`, [user.organizationId])
    ])
    return { budgets: budgets.rows.map(row => planningRow(row, true)), earmarks: earmarks.rows.map(row => planningRow(row, false)) }
  })
  for (const kind of ['budgets', 'earmarks'] as const) {
    const budget = kind === 'budgets'
    const table = budget ? 'web_budgets' : 'web_earmarks'
    const columns = budget ? ['name','year','sphere','amount_planned_cents','category_name','project_name','start_date','end_date','color','is_archived','enforce_time_range'] : ['name','code','description','budget_cents','start_date','end_date','color','is_active','enforce_time_range']
    const select = `SELECT *,start_date::text AS start_date,end_date::text AS end_date FROM ${table}`
    app.get(`/planning/${kind}`, { preHandler: requireRoles('ADMIN','EDITOR') }, async request => {
      const user = (request as AuthenticatedRequest).user
      const result = await getDatabase().query(`${select} WHERE organization_id=$1 ORDER BY name,id`, [user.organizationId])
      return { rows: result.rows.map(row => planningRow(row, budget)) }
    })
    for (const method of ['POST','PATCH'] as const) app.route({ method, url: `/planning/${kind}${method === 'PATCH' ? '/:id' : ''}`, preHandler: requireRoles('ADMIN'), handler: async (request, reply) => {
      const user = (request as AuthenticatedRequest).user
      const schema = budget ? budgetSchema : earmarkSchema
      const body: any = method === 'PATCH' ? schema.extend({version: z.number().int().positive()}).parse(request.body) : schema.parse(request.body)
      if (body.startDate && body.endDate && body.startDate > body.endDate) fail(400,'Zeitraum ist ungültig.')
      const values = budget ? [body.name,body.year,body.sphere,Math.round(body.amountPlanned*100),body.categoryName ?? null,body.projectName ?? null,body.startDate ?? null,body.endDate ?? null,body.color ?? null,body.isArchived ?? false,body.enforceTimeRange ?? false] : [body.name,body.code,body.description ?? null,body.budget == null ? null : Math.round(body.budget*100),body.startDate ?? null,body.endDate ?? null,body.color ?? null,body.isActive ?? true,body.enforceTimeRange ?? false]
      const client = await getDatabase().connect()
      try {
        await client.query('BEGIN')
        let id: number
        if (method === 'POST') {
          const inserted = await client.query(`INSERT INTO ${table}(organization_id,${columns.join(',')}) VALUES($1,${values.map((_,i)=>`$${i+2}`).join(',')}) RETURNING id`, [user.organizationId,...values]); id = inserted.rows[0].id
        } else {
          id = idSchema.parse((request.params as {id:string}).id)
          const current = await client.query(`SELECT version FROM ${table} WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[id,user.organizationId])
          if (!current.rows[0]) fail(404,'Eintrag nicht gefunden.')
          if (current.rows[0].version !== body.version) fail(409,'Der Eintrag wurde inzwischen geändert. Bitte neu laden.')
          await client.query(`UPDATE ${table} SET ${columns.map((column,i)=>`${column}=$${i+1}`).join(',')},version=version+1 WHERE id=$${values.length+1}`, [...values,id])
        }
        await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[user.organizationId,user.userId,method==='POST'?'CREATE':'UPDATE',table,id,JSON.stringify(body)])
        const saved = await client.query(`${select} WHERE id=$1`,[id])
        await client.query('COMMIT'); reply.code(method==='POST'?201:200); return { row: planningRow(saved.rows[0],budget) }
      } catch (error: any) { await client.query('ROLLBACK'); if(error.code==='23505') fail(409,'Dieser Code ist bereits vergeben.'); throw error } finally { client.release() }
    }})
    app.delete(`/planning/${kind}/:id`, {preHandler:requireRoles('ADMIN')}, async request => {
      const user = (request as AuthenticatedRequest).user, id=idSchema.parse((request.params as {id:string}).id)
      const {version}=z.object({version:z.number().int().positive()}).strict().parse(request.body)
      const client=await getDatabase().connect()
      try {
        await client.query('BEGIN')
        const existing=await client.query(`SELECT version FROM ${table} WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[id,user.organizationId])
        if(!existing.rows[0]) fail(404,'Eintrag nicht gefunden.')
        if(existing.rows[0].version!==version) fail(409,'Der Eintrag wurde inzwischen geändert. Bitte neu laden.')
        await client.query(`DELETE FROM ${table} WHERE id=$1`,[id])
        await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[user.organizationId,user.userId,'DELETE',table,id,'{}'])
        await client.query('COMMIT'); return {ok:true}
      } catch(error:any) { await client.query('ROLLBACK'); if(error.code==='23503') fail(409,'Dieser Eintrag wird in Buchungen verwendet. Bitte stattdessen archivieren.'); throw error } finally {client.release()}
    })
    app.get(`/planning/${kind}/:id/usage`, {preHandler:requireRoles('ADMIN','EDITOR')}, async request => {
      const user=(request as AuthenticatedRequest).user,id=idSchema.parse((request.params as {id:string}).id)
      const definition=(await getDatabase().query(`${select} WHERE id=$1 AND organization_id=$2`,[id,user.organizationId])).rows[0]
      if(!definition) fail(404,'Eintrag nicht gefunden.')
      const query=z.object({from:date,to:date,sphere:z.enum(['IDEELL','ZWECK','VERMOEGEN','WGB']).optional()}).parse(request.query)
      const rows=(await getDatabase().query(`SELECT v.date::text AS date,v.type,a.amount_cents FROM ${budget?'web_booking_budget_assignments':'web_booking_earmark_assignments'} a JOIN web_bookings v ON v.id=a.booking_id WHERE a.${budget?'budget_id':'earmark_id'}=$1 AND v.organization_id=$2 AND ($3::date IS NULL OR v.date >= $3) AND ($4::date IS NULL OR v.date <= $4) AND ($5::text IS NULL OR v.sphere=$5)`,[id,user.organizationId,query.from??null,query.to??null,query.sphere??null])).rows
      const rangeStart=definition.start_date || (budget ? `${definition.year}-01-01` : null)
      const rangeEnd=definition.end_date || (budget ? `${definition.year}-12-31` : null)
      let spent=0,inflow=0,inside=0,lastDate:string|null=null
      for(const row of rows){if(row.type==='OUT')spent+=Number(row.amount_cents);else if(row.type==='IN')inflow+=Number(row.amount_cents);if((!rangeStart||row.date>=rangeStart)&&(!rangeEnd||row.date<=rangeEnd))inside++;if(!lastDate||row.date>lastDate)lastDate=row.date}
      const counts={startDate:rangeStart,endDate:rangeEnd}
      if(budget)return{spent:spent/100,inflow:inflow/100,count:rows.length,lastDate,countInside:inside,countOutside:rows.length-inside,...counts}
      const planned=Number(definition.budget_cents??0)/100
      return{allocated:inflow/100,released:spent/100,balance:(inflow-spent)/100,budget:planned,remaining:planned-(spent-inflow)/100,totalCount:rows.length,insideCount:inside,outsideCount:rows.length-inside,...counts}
    })
  }
}
export default planningRoutes
