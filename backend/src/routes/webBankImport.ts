import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { getDatabase } from '../config/database.js'
import { requireRoles } from '../middleware/auth.js'
import { bookingFields, insertBooking } from './workflow.js'
import { parseCsvStatement, type ParsedBankTransaction } from '../services/bankCsv.js'
const mapping=z.object(Object.fromEntries(['bookingDate','valueDate','amount','debit','credit','currency','counterparty','counterpartyIban','purpose','endToEndId','reference','accountIban'].map(key=>[key,z.string().max(255).nullable().optional()]))).strict()
const input=z.object({fileName:z.string().min(1).max(255).regex(/\.csv$/i),fileBase64:z.string().max(1400000).regex(/^[A-Za-z0-9+/]*={0,2}$/),mapping:mapping.optional()}).strict()
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode})}
function parse(body:z.infer<typeof input>){
 let parsed:ReturnType<typeof parseCsvStatement>
 try{parsed=parseCsvStatement(Buffer.from(body.fileBase64,'base64'),body.mapping)}catch(error){fail(400,error instanceof Error?error.message:'CSV konnte nicht gelesen werden.')}
 if(!parsed!.headers.length || !parsed!.rows.length)fail(400,'Die CSV enthält keine Datenzeilen.')
 if(new Set(parsed!.headers).size!==parsed!.headers.length)fail(400,'CSV-Spaltenüberschriften müssen eindeutig sein.')
 for(const row of parsed!.rows){
  if(!bookingFields.shape.date.safeParse(row.bookingDate).success)row.errors.push('Ungültiges Buchungsdatum.')
  if(row.valueDate&&!bookingFields.shape.date.safeParse(row.valueDate).success)row.errors.push('Ungültige Wertstellung.')
  const cents=Math.round(row.amount*100)
  if(!Number.isSafeInteger(cents)||cents<=0||Math.abs(row.amount-cents/100)>1e-9)row.errors.push('Betrag muss positiv sein und höchstens zwei Nachkommastellen haben.')
  if((row.purpose?.length||0)>1800||(row.counterparty?.length||0)>255)row.errors.push('Verwendungszweck oder Gegenpartei ist zu lang.')
 }
 return parsed!
}
function present(row:Record<string,any>){return{...row.data,id:row.id,version:row.version,bookingDate:row.booking_date,amount:Number(row.gross_amount_cents)/100,direction:row.direction,status:row.status,paymentAccountId:1,paymentAccountName:'Bank',voucherId:row.booking_id,voucherNo:row.voucher_no||null,voucherDescription:row.voucher_description||null,linkOrigin:row.booking_id?'CREATED':null,sourceFileName:row.file_name}}
const select="SELECT t.*,t.booking_date::text,b.file_name,v.number AS voucher_no,v.description AS voucher_description FROM web_bank_transactions t JOIN web_bank_imports b ON b.id=t.batch_id LEFT JOIN web_bookings v ON v.id=t.booking_id"
export function fingerprint(row:ParsedBankTransaction,ordinal:number){
 const meaningful=(value?:string)=>value&&!/^(NOTPROVIDED|NONREF|N\/A)$/i.test(value)?value:null
 const reference=meaningful(row.bankReference)||meaningful(row.endToEndId)
 const canonical=[row.accountIban||'',row.bookingDate,row.direction,Math.round(row.amount*100),row.currency,reference||'',row.counterpartyIban||'',row.counterparty||'',row.purpose||'',reference?0:ordinal]
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
const webBankImportRoutes:FastifyPluginAsync=async app=>{
 const admins={onRequest:requireRoles('ADMIN')},readers={onRequest:requireRoles('ADMIN','EDITOR')}
 app.post('/bank-imports/preview',{...admins,bodyLimit:1500000},async request=>{
  const parsed=parse(input.parse(request.body));return{...parsed,detectedPaymentAccountId:1,summary:{total:parsed.rows.length,valid:parsed.rows.filter(row=>!row.errors.length).length,errors:parsed.rows.filter(row=>row.errors.length).length}}
 })
 app.post('/bank-imports/commit',{...admins,bodyLimit:1500000},async(request,reply)=>{
  const body=input.extend({paymentAccountId:z.literal(1)}).parse(request.body),parsed=parse(body)
  const client=await getDatabase().connect()
  try{
   await client.query('BEGIN')
   // Serialize import batches per organization; uniqueness remains the database backstop.
   await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[request.user.organizationId])
   const batch=(await client.query('INSERT INTO web_bank_imports(organization_id,file_name,created_by) VALUES($1,$2,$3) RETURNING id',[request.user.organizationId,body.fileName,request.user.userId])).rows[0].id
   const importedTransactionIds:number[]=[],duplicateRows:any[]=[],errors:any[]=[],counts=new Map<string,number>()
   for(const row of parsed.rows){
    if(row.errors.length){errors.push({row:row.sourceRow,message:row.errors.join(' ')});continue}
    const base=fingerprint(row,0),ordinal=(counts.get(base)||0)+1;counts.set(base,ordinal)
    const hash=fingerprint(row,ordinal)
    const existing=await client.query(`${select} WHERE t.organization_id=$1 AND t.fingerprint=$2`,[request.user.organizationId,hash])
    if(existing.rowCount){duplicateRows.push({...row,duplicateBy:'FINGERPRINT',duplicateValue:hash,existing:present(existing.rows[0])});continue}
    const {raw,errors:rowErrors,...data}=row;void raw;void rowErrors
    const inserted=await client.query('INSERT INTO web_bank_transactions(organization_id,batch_id,fingerprint,data,booking_date,gross_amount_cents,direction) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[request.user.organizationId,batch,hash,JSON.stringify(data),row.bookingDate,Math.round(row.amount*100),row.direction]);importedTransactionIds.push(inserted.rows[0].id)
   }
   await client.query('UPDATE web_bank_imports SET imported=$2,duplicates=$3,errors=$4 WHERE id=$1',[batch,importedTransactionIds.length,duplicateRows.length,errors.length])
   await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[request.user.organizationId,request.user.userId,'IMPORT','web_bank_imports',batch,JSON.stringify({importedTransactionIds,duplicates:duplicateRows.length,errors:errors.length})])
   await client.query('COMMIT');return reply.code(201).send({batchId:batch,imported:importedTransactionIds.length,importedTransactionIds,duplicates:duplicateRows.length,duplicateRows,errors})
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 })
 app.get('/bank-transactions',readers,async request=>{
  const query=z.object({status:z.enum(['ALL','OPEN','LINKED','CHECKED']).default('ALL'),paymentAccountId:z.coerce.number().int().optional(),q:z.string().max(500).optional(),sortBy:z.enum(['status','date','description','account','type','amount']).default('date'),sortDir:z.enum(['ASC','DESC']).default('DESC'),page:z.coerce.number().int().positive().default(1),limit:z.coerce.number().int().min(1).max(200).default(50)}).strict().parse(request.query)
  const values:any[]=[request.user.organizationId],where=['t.organization_id=$1'];const bind=(value:any)=>{values.push(value);return `$${values.length}`}
  if(query.status!=='ALL')where.push(`t.status=${bind(query.status)}`)
  if(query.paymentAccountId!=null&&query.paymentAccountId!==1)where.push('FALSE')
  if(query.q){const term=bind(`%${query.q.replace(/[\\%_]/g,'\\$&')}%`);where.push(`(t.data->>'counterparty' ILIKE ${term} OR t.data->>'purpose' ILIKE ${term} OR t.data->>'bankReference' ILIKE ${term} OR t.data->>'endToEndId' ILIKE ${term})`)}
  const condition=where.join(' AND '),db=getDatabase(),stats=(await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='OPEN')::int AS open,count(*) FILTER(WHERE status='LINKED')::int AS linked,0 AS checked FROM web_bank_transactions WHERE organization_id=$1",[request.user.organizationId])).rows[0]
  const total=Number((await db.query(`SELECT count(*) FROM web_bank_transactions t WHERE ${condition}`,values)).rows[0].count)
  const order={status:'t.status',date:'t.booking_date',description:"t.data->>'purpose'",account:'t.id',type:'t.direction',amount:'t.gross_amount_cents'}[query.sortBy]
  const rows=await db.query(`${select} WHERE ${condition} ORDER BY ${order} ${query.sortDir},t.id ASC LIMIT ${bind(query.limit)} OFFSET ${bind((query.page-1)*query.limit)}`,values)
  return{rows:rows.rows.map(present),stats,total}
 })
 app.get('/bank-transactions/import-status',readers,async request=>{
  const db=getDatabase(),org=request.user.organizationId
  const summary=(await db.query('SELECT max(booking_date)::text AS "lastBookingDate",count(*)::int AS total FROM web_bank_transactions WHERE organization_id=$1',[org])).rows[0]
  const batches=(await db.query('SELECT *,created_at::text AS "importedAt" FROM web_bank_imports WHERE organization_id=$1 ORDER BY id DESC LIMIT 10',[org])).rows
  return{...summary,lastImportAt:batches[0]?.importedAt||null,accounts:[{id:1,name:'Bank',...summary,lastImportAt:batches[0]?.importedAt||null}],recentImports:batches.map(batch=>({id:batch.id,fileName:batch.file_name,format:'CSV',paymentAccountId:1,paymentAccountName:'Bank',imported:batch.imported,duplicates:batch.duplicates,errors:batch.errors,importedAt:batch.importedAt}))}
 })
 app.post('/bank-transactions/:id/book',admins,async request=>{
  const id=z.coerce.number().int().positive().parse((request.params as {id:string}).id),body=bookingFields.extend({version:z.number().int().positive()}).parse(request.body)
  const client=await getDatabase().connect()
  try{
   await client.query('BEGIN');const result=await client.query('SELECT *,booking_date::text FROM web_bank_transactions WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,request.user.organizationId]);if(!result.rowCount)fail(404,'Bankbeleg nicht gefunden.')
   const row=result.rows[0]
   if(row.status!=='OPEN'||row.version!==body.version)fail(409,'Dieser Bankbeleg wurde bereits verarbeitet oder geändert. Bitte neu laden.')
   if(body.date!==row.booking_date||body.type!==row.direction||body.grossAmountCents!==Number(row.gross_amount_cents)||body.paymentMethod!=='BANK')fail(400,'Datum, Betrag, Richtung und Zahlweg müssen dem Bankbeleg entsprechen.')
   const {version,...fields}=body;void version
   const booking=await insertBooking(client,request.user,fields,null)
   await client.query("UPDATE web_bank_transactions SET status='LINKED',booking_id=$2,version=version+1 WHERE id=$1",[id,booking.id])
   await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[request.user.organizationId,request.user.userId,'BOOK','web_bank_transactions',id,JSON.stringify({bookingId:booking.id})])
   await client.query('COMMIT');return{booking}
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 })
}
export default webBankImportRoutes
