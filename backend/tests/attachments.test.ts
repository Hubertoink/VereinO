import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { Pool } from 'pg'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import workflowRoutes from '../src/routes/workflow.js'
import webModules from '../src/routes/webModules.js'
import attachmentRoutes from '../src/routes/attachments.js'
import { validateAttachment, MAX_ATTACHMENT_SIZE } from '../src/services/attachments.js'
const png=()=>sharp({create:{width:2,height:2,channels:3,background:'#22aa99'}}).png().toBuffer()
test('receipts validate actual contents, declared types, size and filename',async()=>{
 const image=await png()
 assert.equal((await validateAttachment(image,'Beleg.png','image/png')).mimeType,'image/png')
 const pdf=await PDFDocument.create();pdf.addPage();assert.equal((await validateAttachment(Buffer.from(await pdf.save()),'Beleg.pdf','application/pdf')).mimeType,'application/pdf')
 for(const [data,name,mime] of [[image,'../Beleg.png','image/png'],[image,'Beleg.pdf','application/pdf'],[image,'Beleg.png','text/html'],[image.subarray(0,24),'Beleg.png','image/png'],[Buffer.from('%PDF-1.7\nnot a PDF'),'Beleg.pdf','application/pdf'],[Buffer.from('<svg/>'),'Beleg.svg','image/svg+xml'],[Buffer.alloc(MAX_ATTACHMENT_SIZE+1),'big.png','image/png']] as [Buffer,string,string][])await assert.rejects(validateAttachment(data,name,mime))
})
test('PostgreSQL attachments: ownership, roles, tenant isolation, exact bytes and transactional deletion',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`attachments_test_${randomBytes(8).toString('hex')}`
 await adminPool.query(`CREATE SCHEMA ${schema}`)
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString()
 const db=await initializeDatabase(),app=Fastify()
 try{
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
  const org=(await db.query("INSERT INTO organizations(name) VALUES('Receipts') RETURNING id")).rows[0].id,foreignOrg=(await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id
  const tokens:Record<string,string>={},users:Record<string,number>={}
  for(const [name,role,tenant] of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['foreign','ADMIN',foreignOrg]]){
   users[name]=(await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[tenant,`${name}@receipt.invalid`,'unused',role])).rows[0].id
   tokens[name]=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[sessionHash(tokens[name]),users[name]])
  }
  const bookings:Record<string,number>={}
  for(const who of ['admin','editor'])bookings[who]=(await db.query("INSERT INTO web_bookings(organization_id,created_by,number,type,date,description,gross_amount_cents,sphere,payment_method) VALUES($1,$2,$3,'OUT','2026-09-15','Belegtest',10000,'IDEELL','BANK') RETURNING id",[org,users[who],who])).rows[0].id
  app.decorate('authenticate',authenticate);app.setErrorHandler(errorHandler);await app.register(multipart);await app.register(attachmentRoutes,{prefix:'/api'});await app.register(workflowRoutes,{prefix:'/api'});await app.register(async scope=>{scope.addHook('preHandler',scope.authenticate);await scope.register(webModules)},{prefix:'/api'})
  const get=(who:string,path:string)=>app.inject({url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`}})
  const image=await png()
  const upload=(who:string,booking:number,data=image)=>app.inject({method:'POST',url:`/api/bookings/${booking}/attachments`,headers:{cookie:`vereino_session=${tokens[who]}`,'content-type':'multipart/form-data; boundary=receipt-test'},payload:Buffer.concat([Buffer.from('--receipt-test\r\nContent-Disposition: form-data; name="file"; filename="Beleg.png"\r\nContent-Type: image/png\r\n\r\n'),data,Buffer.from('\r\n--receipt-test--\r\n')])})
  assert.equal((await upload('user',bookings.user||bookings.admin)).statusCode,403)
  assert.equal((await upload('foreign',bookings.admin)).statusCode,404)
  assert.equal((await upload('editor',bookings.admin)).statusCode,403)
  assert.equal((await get('editor',`/bookings/${bookings.admin}/attachments`)).json().canUpload,false)
  const created=await upload('editor',bookings.editor);assert.equal(created.statusCode,201,created.body);const id=created.json().file.id;assert.match(id,/^[\da-f-]{36}$/)
  const content=await get('admin',`/attachments/${id}/content`);assert.equal(content.statusCode,200);assert.deepEqual(content.rawPayload,image);assert.match(String(content.headers['content-disposition']),/^attachment;/);assert.equal(content.headers['x-content-type-options'],'nosniff')
  assert.equal((await get('foreign',`/attachments/${id}/content`)).statusCode,404)
  assert.equal((await get('user',`/attachments/${id}/content`)).statusCode,403)
  assert.equal((await get('admin',`/bookings/${bookings.editor}/attachments`)).json().files.length,1)
  assert.equal((await upload('admin',bookings.admin,Buffer.from('fake png'))).statusCode,400)
  assert.equal((await upload('admin',bookings.admin,Buffer.alloc(MAX_ATTACHMENT_SIZE+1))).statusCode,413)
  const remove=(who:string)=>app.inject({method:'DELETE',url:`/api/attachments/${id}`,headers:{cookie:`vereino_session=${tokens[who]}`}})
  assert.equal((await remove('editor')).statusCode,403);assert.equal((await remove('foreign')).statusCode,404)
  assert.equal((await remove('admin')).statusCode,200);assert.equal((await get('admin',`/attachments/${id}/content`)).statusCode,404)
  assert.equal(Number((await db.query("SELECT count(*) FROM audit_log WHERE entity_type='web_attachments'")).rows[0].count),2)
  const request=(who:string,method:'POST'|'PATCH'|'DELETE',path:string,payload?:object)=>app.inject({method,url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},payload})
  const stage=(who:string,path='/attachments/staged')=>app.inject({method:'POST',url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`,'content-type':'multipart/form-data; boundary=receipt-test'},payload:Buffer.concat([Buffer.from('--receipt-test\r\nContent-Disposition: form-data; name="file"; filename="Beleg.png"\r\nContent-Type: image/png\r\n\r\n'),image,Buffer.from('\r\n--receipt-test--\r\n')])})
  const staged=await stage('user');assert.equal(staged.statusCode,201,staged.body);const stagedId=staged.json().file.id
  assert.equal((await get('editor',`/attachments/${stagedId}/content`)).statusCode,404)
  const fields={type:'OUT',date:'2026-09-17',description:'Einreichung mit Beleg',grossAmountCents:2500,sphere:'IDEELL',paymentMethod:'BANK',attachmentIds:[stagedId]}
  assert.equal((await request('editor','POST','/drafts',fields)).statusCode,409)
  assert.equal((await request('foreign','POST','/drafts',fields)).statusCode,409)
  const draftResponse=await request('user','POST','/drafts',fields);assert.equal(draftResponse.statusCode,201,draftResponse.body);let draft=draftResponse.json().draft
  assert.equal((await request('user','POST','/drafts',fields)).statusCode,409,'Already bound files cannot create duplicate drafts')
  assert.equal((await get('user',`/drafts/${draft.id}/attachments`)).json().files.length,1)
  assert.equal((await get('foreign',`/drafts/${draft.id}/attachments`)).statusCode,404)
  const submitted=await request('user','POST',`/drafts/${draft.id}/submit`,{version:draft.version});assert.equal(submitted.statusCode,200,submitted.body);draft=submitted.json().draft
  assert.equal((await stage('user',`/drafts/${draft.id}/attachments`)).statusCode,403)
  const extra=await stage('editor',`/drafts/${draft.id}/attachments`);assert.equal(extra.statusCode,201,extra.body)
  assert.equal((await request('editor','PATCH',`/drafts/${draft.id}`,{version:draft.version,tags:['Geprüft']})).statusCode,200)
  draft=(await get('editor','/drafts')).json().drafts.find((row:any)=>row.id===draft.id)
  assert.equal(draft.fileCount,2)
  const approved=await request('editor','POST',`/drafts/${draft.id}/approve`,{version:draft.version});assert.equal(approved.statusCode,200,approved.body);const booking=approved.json().booking
  assert.equal((await get('admin',`/bookings/${booking.id}/attachments`)).json().files.length,2)
  assert.deepEqual((await get('admin',`/attachments/${stagedId}/content`)).rawPayload,image)
  assert.deepEqual((await get('user',`/attachments/${stagedId}/content`)).rawPayload,image,'Submitter can still read own receipt')
  assert.equal((await get('user',`/drafts/${draft.id}/attachments`)).json().canUpload,false)
  assert.equal((await request('user','DELETE',`/attachments/${stagedId}`)).statusCode,403)
  assert.equal((await stage('editor',`/drafts/${draft.id}/attachments`)).statusCode,403)
  const directFile=(await stage('admin')).json().file.id
  const direct=await request('admin','POST','/bookings',{...fields,attachmentIds:[directFile]});assert.equal(direct.statusCode,201,direct.body)
  assert.equal((await get('admin',`/bookings/${direct.json().booking.id}/attachments`)).json().files.length,1)
  const aiId=randomUUID()
  await db.query('INSERT INTO web_ai_documents(id,organization_id,uploaded_by,file_name,mime_type,size,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[aiId,org,users.user,'Analyse.png','image/png',image.length,image])
  const aiDraftResponse=await request('user','POST','/drafts',{...fields,attachmentIds:[],aiDocumentId:aiId});assert.equal(aiDraftResponse.statusCode,201,aiDraftResponse.body)
  const aiDraft=aiDraftResponse.json().draft
  assert.equal((await get('user',`/drafts/${aiDraft.id}/attachments`)).json().files.length,1)
  const aiApproved=await request('editor','POST',`/drafts/${aiDraft.id}/approve`,{version:aiDraft.version});assert.equal(aiApproved.statusCode,200,aiApproved.body)
  assert.equal((await get('user',`/drafts/${aiDraft.id}/attachments`)).json().files.length,1)
  assert.deepEqual((await get('user',`/attachments/${aiId}/content`)).rawPayload,image)
  assert.equal((await request('admin','DELETE',`/attachments/${aiId}`)).statusCode,200)
  assert.equal((await get('user',`/drafts/${aiDraft.id}/attachments`)).json().files.length,0,'Deleted analyzed receipts must not reappear')
  assert.equal((await get('user','/drafts')).json().drafts.find((row:any)=>row.id===aiDraft.id).fileCount,0)
  const modules=(await get('admin','/settings/modules')).json()
  assert(modules.visibleNavItems.includes('KI'))
  assert.equal((await request('editor','PATCH','/settings/modules',{version:modules.version,visibleNavItems:[]})).statusCode,403)
  assert.equal((await request('user','PATCH','/settings/modules',{version:modules.version,visibleNavItems:[]})).statusCode,403)
  const updated=await request('admin','PATCH','/settings/modules',{version:modules.version,visibleNavItems:['Budgets']});assert.equal(updated.statusCode,200,updated.body)
  assert.deepEqual(new Set(updated.json().visibleNavItems),new Set(['Budgets','Dashboard','Buchungen','Einreichungen','Einstellungen']))
  assert.equal((await request('admin','PATCH','/settings/modules',{version:modules.version,visibleNavItems:[]})).statusCode,409)
  assert.equal((await get('user','/settings/modules')).json().visibleNavItems.includes('KI'),false)
  assert.equal((await get('foreign','/settings/modules')).json().visibleNavItems.includes('KI'),true)

 }finally{await app.close();await db.end();await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end()}
})
