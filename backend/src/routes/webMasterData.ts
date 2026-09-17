import type {FastifyPluginAsync} from 'fastify'
import {z} from 'zod'
import {getDatabase} from '../config/database.js'
import {requireRoles} from '../middleware/auth.js'
const text=(max:number)=>z.string().trim().max(max).nullable().optional()
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/,'Farbe muss #RRGGBB sein.').nullable().optional()
const iban=text(50).transform(value=>value?.replace(/\s/g,'').toUpperCase()||null).refine(value=>{
 if(!value)return true
 if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value))return false
 const digits=(value.slice(4)+value.slice(0,4)).replace(/[A-Z]/g,letter=>String(letter.charCodeAt(0)-55))
 let rest=0;for(const digit of digits)rest=(rest*10+Number(digit))%97
 return rest===1
},'Ungültige IBAN.')
const base={name:z.string().trim().min(1).max(200),isActive:z.boolean().default(true)}
export const masterDataSchemas={
 accounts:z.object({...base,kind:z.enum(['CASH','BANK','PAYPAL','CARD','OTHER']),iban,color,sortOrder:z.number().int().min(0).max(1000000).default(0)}).strict(),
 categories:z.object({...base,color,icon:text(32),sortOrder:z.number().int().min(0).max(1000000).default(0)}).strict(),
 tags:z.object({...base,color}).strict(),
 parties:z.object({...base,legalName:text(250),role:z.enum(['SUPPLIER','CUSTOMER','BOTH','OTHER']).default('BOTH'),contactName:text(200),email:z.union([z.string().trim().email().max(254),z.literal('')]).nullable().optional(),phone:text(80),street:text(250),postalCode:text(30),city:text(120),country:z.string().trim().max(80).default('DE'),iban,bic:text(20).refine(value=>!value||/^[A-Za-z]{4}[A-Za-z]{2}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test(value),'Ungültige BIC.'),taxNumber:text(80),vatId:text(40),paymentTermDays:z.number().int().min(0).max(3650).nullable().optional(),note:text(4000)}).strict()
}
const kindSchema=z.enum(['accounts','categories','parties','tags'])
const fail=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode})}
function view(row:Record<string,any>){return{...row.data,id:row.id,name:row.name,isActive:row.is_active,version:row.version}}
const webMasterDataRoutes:FastifyPluginAsync=async app=>{
 app.get('/settings/master-data/:kind',{onRequest:requireRoles('ADMIN','EDITOR')},async request=>{
  const kind=kindSchema.parse((request.params as {kind:string}).kind)
  const query=z.object({q:z.string().trim().max(500).optional(),activeOnly:z.enum(['true','false']).optional(),role:z.enum(['SUPPLIER','CUSTOMER','BOTH','OTHER']).optional(),limit:z.coerce.number().int().min(1).max(5000).default(5000)}).strict().parse(request.query)
  const values:unknown[]=[request.user.organizationId,kind],where=['organization_id=$1','kind=$2'];const bind=(value:unknown)=>{values.push(value);return `$${values.length}`}
  if(query.activeOnly==='true')where.push('is_active=TRUE')
  if(query.role){if(kind!=='parties')fail(400,'Rollenfilter ist nur für Geschäftspartner verfügbar.');where.push(`data->>'role'=${bind(query.role)}`)}
  if(query.q){const term=bind(`%${query.q.replace(/[\\%_]/g,'\\$&')}%`);where.push(`(name ILIKE ${term} OR data->>'city' ILIKE ${term} OR data->>'email' ILIKE ${term} OR data->>'iban' ILIKE ${term})`)}
  const result=await getDatabase().query(`SELECT * FROM web_master_data WHERE ${where.join(' AND ')} ORDER BY COALESCE((data->>'sortOrder')::integer,0),lower(name),id LIMIT ${bind(query.limit)}`,values)
  return{rows:result.rows.map(view)}
 })
 for(const method of ['POST','PATCH'] as const)app.route({method,url:method==='POST'?'/settings/master-data/:kind':'/settings/master-data/:kind/:id',onRequest:requireRoles('ADMIN'),handler:async(request,reply)=>{
  const kind=kindSchema.parse((request.params as {kind:string}).kind),schema=masterDataSchemas[kind]
  const id=method==='PATCH'?z.coerce.number().int().positive().parse((request.params as {id:string}).id):null
  const body=method==='POST'?schema.parse(request.body):schema.partial().extend({version:z.number().int().positive()}).parse(request.body)
  if(method==='PATCH'&&Object.keys(body).length<2)fail(400,'Bitte mindestens ein Feld ändern.')
  const client=await getDatabase().connect()
  try{
   await client.query('BEGIN');let before:Record<string,any>|null=null
   if(id){const existing=await client.query('SELECT * FROM web_master_data WHERE id=$1 AND organization_id=$2 AND kind=$3 FOR UPDATE',[id,request.user.organizationId,kind]);if(!existing.rowCount)fail(404,'Stammdatensatz nicht gefunden.');before=view(existing.rows[0]);if(before!.version!==(body as any).version)fail(409,'Der Eintrag wurde inzwischen geändert. Bitte neu laden.')}
   const persisted=before?Object.fromEntries(Object.entries(before).filter(([key])=>!['id','version'].includes(key))):{}
   const changes=Object.fromEntries(Object.entries(body).filter(([key])=>key!=='version'))
   const {name,isActive,...data}=schema.parse({...persisted,...changes})
   const result=id?await client.query('UPDATE web_master_data SET name=$4,is_active=$5,data=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND kind=$3 RETURNING *',[id,request.user.organizationId,kind,name,isActive,JSON.stringify(data)]):await client.query('INSERT INTO web_master_data(organization_id,kind,name,is_active,data) VALUES($1,$2,$3,$4,$5) RETURNING *',[request.user.organizationId,kind,name,isActive,JSON.stringify(data)])
   const row=view(result.rows[0]);await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[request.user.organizationId,request.user.userId,id?'UPDATE':'CREATE',`web_master_${kind}`,row.id,JSON.stringify({before,after:row})]);await client.query('COMMIT');return reply.code(id?200:201).send({row})
  }catch(error:any){await client.query('ROLLBACK');if(error.code==='23505')fail(409,'Dieser Name ist bereits vergeben.');throw error}finally{client.release()}
 }})
}
export default webMasterDataRoutes
