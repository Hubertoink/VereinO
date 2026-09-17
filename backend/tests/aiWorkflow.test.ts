import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Pool } from 'pg'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { PDFDocument } from 'pdf-lib'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import workflow from '../src/routes/workflow.js'
import attachments from '../src/routes/attachments.js'
import ai from '../src/routes/webAi.js'

test('invoice HTTP workflow: analyze, owned draft, editor approval, attachment and rollback', {skip: !process.env.TEST_DATABASE_URL}, async()=>{
 const pool = new Pool({connectionString:process.env.TEST_DATABASE_URL})
 const schema = `ai_flow_${randomBytes(8).toString('hex')}`
 await pool.query(`CREATE SCHEMA ${schema}`)
 const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options',`-c search_path=${schema}`)
 process.env.DATABASE_URL = url.toString()
 const db=await initializeDatabase(), app=Fastify()
 const oldFetch=globalThis.fetch, oldKey=process.env.AI_ENCRYPTION_KEY
 process.env.AI_ENCRYPTION_KEY=randomBytes(32).toString('hex')
 try {
  const directory=new URL('../migrations/',import.meta.url)
  for(const file of (await readdir(directory)).filter(file=>file.endsWith('.sql')).sort()) await db.query(await readFile(new URL(file,directory),'utf8'))
  const org=(await db.query("INSERT INTO organizations(name) VALUES('AI workflow') RETURNING id")).rows[0].id
  const tokens:Record<string,string>={}
  for(const role of ['ADMIN','EDITOR','USER']){
   const user=(await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[org,`${role}@test.invalid`,'unused',role])).rows[0].id
   tokens[role]=randomBytes(32).toString('hex')
   await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionHash(tokens[role]),user])
  }
  app.decorate('authenticate',authenticate);app.setErrorHandler(errorHandler)
  await app.register(multipart);await app.register(ai);await app.register(workflow);await app.register(attachments)
  const call=(role:string,method:'POST'|'PATCH'|'GET',url:string,payload?:any)=>app.inject({method,url,headers:{cookie:`vereino_session=${tokens[role]}`},...(payload?{payload}:{})})
  assert.equal((await call('ADMIN','PATCH','/ai/settings',{version:0,enabled:true,provider:'openai',model:'test',textModel:'test',apiKey:'test-key'})).statusCode,200)
  const fields={date:'2026-09-16',description:'Invoice',counterparty:'Shop',grossAmountCents:1234,type:'OUT',sphere:'IDEELL',primaryClassificationValueId:null,warnings:[]}
  let providerCalls=0
  globalThis.fetch=async()=>{providerCalls++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fields)}]}]})}
  const proposal=await call('USER','POST','/ai/booking-proposal',{prompt:'Büromaterial 12,34 EUR am 16.09.2026'})
  assert.equal(proposal.statusCode,200,proposal.body)
  assert.equal(proposal.json().fields.grossAmountCents,1234)
  assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings')).rows[0].count),0)
  assert.equal(Number((await db.query('SELECT count(*) FROM web_drafts')).rows[0].count),0)
  providerCalls=0
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Invoice 12.34 EUR');const bytes=Buffer.from(await pdf.save())
  const upload=(url='/ai/invoice')=>app.inject({method:'POST',url,headers:{cookie:`vereino_session=${tokens.USER}`,'content-type':'multipart/form-data; boundary=ai-test'},payload:Buffer.concat([Buffer.from('--ai-test\r\nContent-Disposition: form-data; name="file"; filename="invoice.pdf"\r\nContent-Type: application/pdf\r\n\r\n'),bytes,Buffer.from('\r\n--ai-test--\r\n')])})
  const storedOnly=await upload('/ai/documents');assert.equal(storedOnly.statusCode,200,storedOnly.body);assert.equal(providerCalls,0)
  assert.deepEqual((await db.query('SELECT data FROM web_ai_documents WHERE id=$1',[storedOnly.json().documentId])).rows[0].data,bytes)
  await db.query("UPDATE web_ai_documents SET created_at=now()-interval '25 hours' WHERE id=$1",[storedOnly.json().documentId])
  assert.equal((await call('USER','GET',`/ai/documents/${storedOnly.json().documentId}/content`)).statusCode,404)
  assert.equal((await call('USER','DELETE',`/ai/documents/${storedOnly.json().documentId}`)).statusCode,200)
  const analyzed=await upload();assert.equal(analyzed.statusCode,200,analyzed.body);assert.equal(providerCalls,1)
  const aiDocumentId=analyzed.json().documentId
  assert.equal((await call('USER','GET','/ai/documents')).json().rows[0].documentId,aiDocumentId)
  assert.equal((await call('EDITOR','GET','/ai/documents')).json().rows.length,0)
  const original=await call('USER','GET',`/ai/documents/${aiDocumentId}/content`);assert.equal(original.statusCode,200);assert.deepEqual(original.rawPayload,bytes)
  assert.equal((await call('EDITOR','GET',`/ai/documents/${aiDocumentId}/content`)).statusCode,404)
  assert.equal((await call('EDITOR','DELETE',`/ai/documents/${aiDocumentId}`)).statusCode,404)
  const discarded=(await upload()).json().documentId
  assert.equal((await call('USER','DELETE',`/ai/documents/${discarded}`)).statusCode,200)
  assert.equal((await call('USER','GET','/ai/documents')).json().rows.length,1)
  const {warnings,...bookingFields}=fields
  await db.query("INSERT INTO web_organization_profiles(organization_id,profile) VALUES($1,'GENERAL')", [org])
  const category=(await db.query("INSERT INTO web_master_data(organization_id,kind,name) VALUES($1,'categories','Office') RETURNING id", [org])).rows[0].id
  const payload={...bookingFields,primaryClassificationValueId:category,paymentMethod:'BANK',aiDocumentId}
  const count=async(table:string)=>Number((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count)
  const before=await count('web_bookings')
  assert.equal((await call('EDITOR','POST','/bookings',payload)).statusCode,409)
  assert.equal(await count('web_bookings'),before,'failed binding rolls back booking')
  assert.equal(await count('web_booking_sequences'),0,'failed binding rolls back reference sequence')
  const created=await call('USER','POST','/drafts',payload);assert.equal(created.statusCode,201,created.body)
  assert.equal((await call('USER','GET','/ai/documents')).json().rows.length,0)
  assert.equal((await call('USER','DELETE',`/ai/documents/${aiDocumentId}`)).statusCode,404)
  assert.equal((await call('USER','GET',`/ai/documents/${aiDocumentId}/content`)).statusCode,404)
  const draft=created.json().draft;assert.equal(draft.aiDocumentId,aiDocumentId)
  assert.equal((await call('USER','POST','/drafts',payload)).statusCode,409)
  assert.equal(await count('web_drafts'),1,'duplicate binding rolls back draft')
  assert.equal((await call('USER','POST',`/drafts/${draft.id}/submit`,{version:1})).statusCode,200)
  await assert.rejects(db.query("UPDATE web_organization_profiles SET profile='NONPROFIT' WHERE organization_id=$1",[org]))
  await db.query('UPDATE web_master_data SET is_active=false WHERE id=$1',[category])
  const approved=await call('EDITOR','POST',`/drafts/${draft.id}/approve`,{version:2});assert.equal(approved.statusCode,200,approved.body)
  const booking=approved.json().booking
  assert.equal(booking.primaryClassificationValueId,category,'approval preserves historical category after profile switch/archive')
  const list=await call('EDITOR','GET',`/bookings/${booking.id}/attachments`);assert.equal(list.json().files.length,1)
  const content=await call('EDITOR','GET',`/attachments/${aiDocumentId}/content`);assert.deepEqual(content.rawPayload,bytes)
  assert.equal((await call('USER','GET',`/attachments/${aiDocumentId}/content`)).statusCode,403)
 } finally {
  globalThis.fetch=oldFetch
  if(oldKey===undefined)delete process.env.AI_ENCRYPTION_KEY;else process.env.AI_ENCRYPTION_KEY=oldKey
  await app.close();await db.end();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end()
 }
})
