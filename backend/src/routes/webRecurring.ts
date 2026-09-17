import { addPrimaryClassificationLabels } from '../services/webClassification.js'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { requireRoles } from '../middleware/auth.js'
import { bookingFields, insertBooking } from './workflow.js'
import { berlinToday, dueCount, nextOccurrence } from '../services/recurring.js'
const date = bookingFields.shape.date
const status = z.enum(['ACTIVE','PAUSED','ENDED'])
const version = z.number().int().positive()
export const recurringFields = z.object({
 name:z.string().trim().min(1).max(255),
 primaryClassificationValueId:bookingFields.shape.primaryClassificationValueId,
 type:bookingFields.shape.type,sphere:bookingFields.shape.sphere,
 description:z.string().trim().max(1800).nullable().optional(),
 counterparty:bookingFields.shape.counterparty,
 grossAmountCents:bookingFields.shape.grossAmountCents,
 paymentMethod:bookingFields.shape.paymentMethod,
 frequency:z.enum(['WEEKLY','MONTHLY','QUARTERLY','YEARLY']),
 startDate:date,nextDueDate:date,endDate:date.nullable().optional(),
 variableAmount:z.boolean().default(false),status:status.default('ACTIVE')
}).strict()
function fail(statusCode:number,message:string):never {throw Object.assign(new Error(message),{statusCode})}
function validateSchedule(data:z.infer<typeof recurringFields>) {
 if(data.nextDueDate<data.startDate || (data.endDate && data.endDate<data.startDate)) fail(400,'Fälligkeit und Ende dürfen nicht vor dem Beginn liegen.')
 if(data.status!=='ENDED' && data.endDate && data.nextDueDate>data.endDate) fail(400,'Die nächste Fälligkeit liegt nach dem Ende.')
}
function serialize(row:Record<string,any>) {
 const next=row.next_due_date, data=row.data
 const count=row.status==='ACTIVE' ? dueCount(next,berlinToday(),data.frequency,data.startDate,data.endDate) : 0
 return {...data,id:row.id,version:row.version,status:row.status,nextDueDate:next,dueCount:count,earliestDueDate:count ? next : null,lastBookedDate:row.last_booked_date || null}
}
const webRecurringRoutes:FastifyPluginAsync=async app=>{
 const readers={onRequest:requireRoles('ADMIN','EDITOR')}, admins={onRequest:requireRoles('ADMIN')}
 const queryRows=async (org:number)=> (await getDatabase().query("SELECT r.*,r.next_due_date::text,(SELECT max(o.due_date)::text FROM web_recurring_occurrences o WHERE o.recurring_id=r.id AND o.action='BOOK') AS last_booked_date FROM web_recurring r WHERE organization_id=$1 ORDER BY r.next_due_date,r.id",[org])).rows.map(serialize)
 app.get('/recurring',readers,async request=>{
  const query=z.object({q:z.string().max(500).optional(),status:status.optional()}).strict().parse(request.query)
  const rows=await addPrimaryClassificationLabels(getDatabase(),request.user.organizationId,await queryRows(request.user.organizationId))
  return {rows:rows.filter(row=>(!query.status || row.status===query.status)&&(!query.q || `${row.name} ${row.description||''} ${row.counterparty||''}`.toLocaleLowerCase('de').includes(query.q.toLocaleLowerCase('de'))))}
 })
 app.get('/recurring/summary',readers,async request=>{
  const rows=await queryRows(request.user.organizationId),today=berlinToday()
  const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+30)
  return {due:rows.reduce((sum,row)=>sum+row.dueCount,0),upcoming:rows.filter(row=>row.status==='ACTIVE' && row.nextDueDate>today && row.nextDueDate<=end.toISOString().slice(0,10) && (!row.endDate || row.nextDueDate<=row.endDate)).length,active:rows.filter(row=>row.status==='ACTIVE').length,paused:rows.filter(row=>row.status==='PAUSED').length}
 })
 for(const action of ['create','update','status','book','skip'] as const) app.route({
  method:action==='create' || action==='book' || action==='skip' ? 'POST':'PATCH',
  url:action==='create' ? '/recurring' : action==='update' ? '/recurring/:id' : `/recurring/:id/${action}`,...admins,
  handler:async(request,reply)=>{
   const id=action==='create'?null:z.coerce.number().int().positive().parse((request.params as {id:string}).id)
   const body=action==='create'?recurringFields.parse(request.body):action==='update'?recurringFields.extend({version}).parse(request.body):action==='status'?z.object({version,status}).strict().parse(request.body):z.object({version,expectedDueDate:date,...(action==='book'?{bookingDate:date,grossAmountCents:bookingFields.shape.grossAmountCents}:{})}).strict().parse(request.body)
   const client=await getDatabase().connect()
   try {
    await client.query('BEGIN')
    let before:Record<string,any>|null=null,after:Record<string,any>|null=null,booking:Record<string,any>|null=null
    if(id) {
     const found=await client.query('SELECT *,next_due_date::text FROM web_recurring WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,request.user.organizationId])
     if(!found.rowCount) fail(404,'Dauerbuchung nicht gefunden.')
     before=serialize(found.rows[0])
     if(before!.version!==(body as any).version) fail(409,'Die Dauerbuchung wurde inzwischen geändert. Bitte neu laden.')
    }
    if(action==='create'||action==='update') {
     const fields=recurringFields.parse(Object.fromEntries(Object.entries(body).filter(([key])=>key!=='version')))
     validateSchedule(fields)
     if(fields.primaryClassificationValueId != null) {
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE',[request.user.organizationId])
      const category=await client.query("SELECT m.id FROM web_master_data m JOIN web_organization_profiles p ON p.organization_id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2 AND m.kind='categories' AND ((p.profile='GENERAL' AND m.is_active) OR m.id=$3) FOR SHARE OF m",[fields.primaryClassificationValueId,request.user.organizationId,before?.primaryClassificationValueId||null])
      if(!category.rowCount)fail(400,'Die Kategorie ist für diese Organisation nicht verfügbar.')
     }

     if(before?.status==='ENDED') fail(409,'Beendete Dauerbuchungen können nicht fortgesetzt oder verändert werden.')
     if(id && (await client.query('SELECT 1 FROM web_recurring_occurrences WHERE recurring_id=$1 AND due_date >= $2 LIMIT 1',[id,fields.nextDueDate])).rowCount) fail(409,'Diese oder eine spätere Fälligkeit wurde bereits verarbeitet. Wähle eine spätere nächste Fälligkeit.')
     const {nextDueDate,status:state,...data}=fields
     const result=id?await client.query('UPDATE web_recurring SET data=$3,status=$4,next_due_date=$5,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *,next_due_date::text',[id,request.user.organizationId,JSON.stringify(data),state,nextDueDate]):await client.query('INSERT INTO web_recurring(organization_id,data,status,next_due_date) VALUES($1,$2,$3,$4) RETURNING *,next_due_date::text',[request.user.organizationId,JSON.stringify(data),state,nextDueDate])
     after=serialize(result.rows[0])
    } else if(action==='status') {
     if(before!.status==='ENDED') fail(409,'Beendete Dauerbuchungen können nicht fortgesetzt werden.')
     const result=await client.query('UPDATE web_recurring SET status=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *,next_due_date::text',[id,request.user.organizationId,(body as any).status]);after=serialize(result.rows[0])
    } else {
     const input=body as {expectedDueDate:string;bookingDate?:string;grossAmountCents?:number}
     if(before!.status!=='ACTIVE' || before!.dueCount===0 || before!.nextDueDate!==input.expectedDueDate) fail(409,'Diese Fälligkeit ist nicht mehr offen. Bitte neu laden.')
     if((await client.query('SELECT 1 FROM web_recurring_occurrences WHERE recurring_id=$1 AND due_date=$2',[id,input.expectedDueDate])).rowCount) fail(409,'Diese Fälligkeit wurde bereits verarbeitet.')
     if(action==='book') {
      const fields=bookingFields.parse({primaryClassificationValueId:before!.primaryClassificationValueId,type:before!.type,sphere:before!.sphere,date:input.bookingDate,description:`${before!.description||before!.name} (${input.expectedDueDate})`,counterparty:before!.counterparty,grossAmountCents:input.grossAmountCents,paymentMethod:before!.paymentMethod})
      booking=await insertBooking(client,request.user,fields,null,id!)
     }
     await client.query('INSERT INTO web_recurring_occurrences(recurring_id,due_date,booking_id,action,created_by) VALUES($1,$2,$3,$4,$5)',[id,input.expectedDueDate,booking?.id||null,action==='book'?'BOOK':'SKIP',request.user.userId])
     const next=nextOccurrence(before!.nextDueDate,before!.frequency,before!.startDate)
     const nextStatus=before!.endDate && next>before!.endDate?'ENDED':'ACTIVE'
     const result=await client.query('UPDATE web_recurring SET next_due_date=$3,status=$4,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *,next_due_date::text',[id,request.user.organizationId,next,nextStatus]);after=serialize(result.rows[0])
    }
    await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[request.user.organizationId,request.user.userId,action.toUpperCase(),'web_recurring',id||after!.id,JSON.stringify({before,after,bookingId:booking?.id})])
    await client.query('COMMIT')
    return reply.code(action==='create'?201:200).send({row:after,...(booking?{booking,voucherNo:booking.number}:{})})
   } catch(error:any) {await client.query('ROLLBACK');if(error.code==='23505') fail(409,'Diese Fälligkeit wurde bereits verarbeitet.');throw error} finally {client.release()}
  }
 })
}
export default webRecurringRoutes
