import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import Fastify from 'fastify'
import {Pool} from 'pg'
import sharp from 'sharp'
import {PDFDocument} from 'pdf-lib'
import {initializeDatabase} from '../src/config/database.js'
import {authenticate,sessionHash} from '../src/middleware/auth.js'
import {errorHandler} from '../src/middleware/error.js'
import webSettingsRoutes from '../src/routes/webSettings.js'
import {masterDataSchemas} from '../src/routes/webMasterData.js'
import {normalizeOrganizationPatch,organizationPatchSchema} from '../src/services/organizationSettings.js'
const definitions={accounts:{name:'Hauptkonto',kind:'BANK',iban:'DE89 3704 0044 0532 0130 00',color:'#123456',sortOrder:2},categories:{name:'Veranstaltung',color:'#123456',icon:'🎉',sortOrder:1},tags:{name:'Sommerfest',color:'#123456'},parties:{name:'Muster GmbH',legalName:'Muster und Partner GmbH',role:'SUPPLIER',contactName:'Erika Muster',email:'erika@example.org',phone:'+49 123 456',street:'Teststraße 1',postalCode:'12345',city:'Berlin',country:'DE',iban:'DE89370400440532013000',bic:'COBADEFFXXX',taxNumber:'12/345/67890',vatId:'DE123456789',paymentTermDays:30,note:'Abrechnung monatlich'}}
test('master-data validation rejects malformed accounting identities and arbitrary persisted fields',()=>{
 for(const[kind,fields]of Object.entries(definitions))assert.equal(masterDataSchemas[kind as keyof typeof masterDataSchemas].safeParse(fields).success,true)
 assert.equal(masterDataSchemas.accounts.safeParse({...definitions.accounts,iban:'DE00370400440532013000'}).success,false)
 assert.equal(masterDataSchemas.parties.safeParse({...definitions.parties,bic:'INVALID'}).success,false)
 assert.equal(masterDataSchemas.tags.safeParse({...definitions.tags,color:'red'}).success,false)
 assert.equal(masterDataSchemas.categories.safeParse({...definitions.categories,organizationId:99}).success,false)
 assert.equal(masterDataSchemas.accounts.safeParse({...definitions.accounts,isActive:1}).success,false)
 assert.equal(organizationPatchSchema.safeParse({version:1,profile:'GENERAL'}).success,false)
 assert.equal(organizationPatchSchema.safeParse({version:1}).success,false)
})
test('organization document validation verifies real image/PDF data, size and date ranges',async()=>{
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#112233'}}).png().toBuffer()
 const logo=`data:image/png;base64,${png.toString('base64')}`
 await normalizeOrganizationPatch({version:1,logoDataUrl:logo})
 await assert.rejects(()=>normalizeOrganizationPatch({version:1,logoDataUrl:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='}))
 await assert.rejects(()=>normalizeOrganizationPatch({version:1,logoDataUrl:logo.replace('image/png','image/jpeg')}))
 await assert.rejects(()=>normalizeOrganizationPatch({version:1,logoDataUrl:'data:image/png;base64,'+Buffer.from('not an image').toString('base64')}))
 await assert.rejects(()=>normalizeOrganizationPatch({version:1,taxCertificate:{fileName:'tax.pdf',fileData:Buffer.from('%PDF-fake').toString('base64'),fileSize:9,mimeType:'application/pdf'}}))
 await assert.rejects(()=>normalizeOrganizationPatch({version:1,taxCertificate:{fileName:'tax.png',fileData:png.toString('base64'),fileSize:png.length+1,mimeType:'image/png'}}))
 assert.equal(organizationPatchSchema.safeParse({version:1,taxCertificate:{fileName:'tax.png',fileData:png.toString('base64'),fileSize:png.length,mimeType:'image/png',validFrom:'2026-02-30'}}).success,false)
 assert.equal(organizationPatchSchema.safeParse({version:1,taxCertificate:{fileName:'tax.png',fileData:png.toString('base64'),fileSize:png.length,mimeType:'image/png',validFrom:'2026-09-01',validUntil:'2026-01-01'}}).success,false)
})
test('PostgreSQL settings master CRUD/archive, roles, tenant isolation, versions, full organization identity and audit rollback',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`master_test_${randomBytes(8).toString('hex')}`;await adminPool.query(`CREATE SCHEMA ${schema}`)
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString()
 const db=await initializeDatabase(),app=Fastify()
 try{
  for(const name of ['001_initial_schema.sql','002_auth.sql','016_web_organization_memberships.sql','008_web_settings.sql','010_web_master_data.sql'])await db.query(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  const org=(await db.query("INSERT INTO organizations(name) VALUES('Original') RETURNING id")).rows[0].id,foreign=(await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id,tokens:Record<string,string>={}
  for(const[name,role,organization]of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['foreign','ADMIN',foreign]]){const id=(await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[organization,`${name}@master.invalid`,'unused',role])).rows[0].id;tokens[name]=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionHash(tokens[name]),id])}
  app.decorate('authenticate',authenticate);app.setErrorHandler(errorHandler);await app.register(webSettingsRoutes,{prefix:'/api'})
  const call=(who:string,method:'GET'|'POST'|'PATCH'|'DELETE',path:string,payload?:unknown)=>app.inject({method,url:`/api/settings/${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},...(payload===undefined?{}:{payload:payload as object})})
  const rowIds:Record<string,number>={}
  for(const[kind,fields]of Object.entries(definitions)){
   const path=`master-data/${kind}`
   assert.equal((await app.inject(`/api/settings/${path}`)).statusCode,401)
   assert.equal((await call('user','GET',path)).statusCode,403)
   assert.equal((await call('editor','POST',path,fields)).statusCode,403)
   const created=await call('admin','POST',path,fields);assert.equal(created.statusCode,201,created.body)
   const row=created.json().row;rowIds[kind]=row.id;assert.equal(row.isActive,true);assert.equal(row.version,1)
   assert.equal((await call('editor','GET',path)).json().rows.length,1)
   assert.equal((await call('foreign','GET',path)).json().rows.length,0)
   assert.equal((await call('foreign','PATCH',`${path}/${row.id}`,{version:1,name:'Tamper'})).statusCode,404)
   assert.equal((await call('editor','PATCH',`${path}/${row.id}`,{version:1,name:'Denied'})).statusCode,403)
   assert.equal((await call('admin','PATCH',`${path}/${row.id}`,{version:1,name:'Renamed',organizationId:foreign})).statusCode,400)
   if(kind!=='parties')assert.equal((await call('admin','POST',path,{...fields,name:fields.name.toUpperCase()})).statusCode,409)
   const archive=await call('admin','PATCH',`${path}/${row.id}`,{version:1,isActive:false});assert.equal(archive.statusCode,200,archive.body);assert.equal(archive.json().row.isActive,false);assert.equal(archive.json().row.name,fields.name)
   assert.equal((await call('editor','GET',`${path}?activeOnly=true`)).json().rows.length,0)
   assert.equal((await call('admin','PATCH',`${path}/${row.id}`,{version:1,isActive:true})).statusCode,409)
   assert.equal((await call('admin','PATCH',`${path}/${row.id}`,{version:2,isActive:true})).statusCode,200)
   assert.equal((await call('admin','DELETE',`${path}/${row.id}`)).statusCode,404)
  }
  assert.equal((await call('editor','GET','master-data/parties?q=Berlin')).json().rows[0].iban,'DE89370400440532013000')
  assert.equal((await call('editor','GET','master-data/parties?role=CUSTOMER')).json().rows.length,0)
  const concurrent=await Promise.all([call('admin','PATCH',`master-data/tags/${rowIds.tags}`,{version:3,name:'Updated A'}),call('admin','PATCH',`master-data/tags/${rowIds.tags}`,{version:3,name:'Updated B'})]);assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,409])
  const png=await sharp({create:{width:2,height:2,channels:4,background:'#112233'}}).png().toBuffer(),logoDataUrl=`data:image/png;base64,${png.toString('base64')}`
  const pdf=await PDFDocument.create();pdf.addPage();const fileData=Buffer.from(await pdf.save())
  const taxCertificate={fileName:'Befreiung.pdf',fileData:fileData.toString('base64'),fileSize:fileData.length,mimeType:'application/pdf',validFrom:'2026-01-01',validUntil:'2028-12-31'}
  assert.equal((await call('user','GET','organization')).statusCode,403)
  assert.equal((await call('editor','PATCH','organization',{version:1,address:'Denied'})).statusCode,403)
  const saved=await call('admin','PATCH','organization',{version:1,name:'Testverein',address:'Musterstraße 1\n12345 Berlin',cashier:'Erika Muster',logoDataUrl,taxCertificate});assert.equal(saved.statusCode,200,saved.body)
  assert.equal(saved.json().organization.version,2);assert.ok(saved.json().organization.taxCertificate.uploadDate)
  const renamed=await call('admin','PATCH','organization',{version:2,name:'Testverein e.V.'});assert.equal(renamed.statusCode,200,renamed.body);assert.equal(renamed.json().organization.logoDataUrl,logoDataUrl);assert.equal(renamed.json().organization.taxCertificate.fileData,taxCertificate.fileData);assert.equal(renamed.json().organization.address,'Musterstraße 1\n12345 Berlin')
  assert.equal((await call('admin','PATCH','organization',{version:2,cashier:'Stale'})).statusCode,409)
  assert.equal((await call('foreign','GET','organization')).json().organization.logoDataUrl,null)
  const read=(await call('editor','GET','organization')).json().organization;assert.equal(read.cashier,'Erika Muster');assert.equal(read.taxCertificate.validUntil,'2028-12-31')
  const audit=JSON.stringify((await db.query("SELECT changes FROM audit_log WHERE entity_type='organizations'")).rows);assert.ok(!audit.includes(taxCertificate.fileData));assert.ok(!audit.includes(logoDataUrl));assert.ok(audit.includes('sha256'))
  await db.query("ALTER TABLE audit_log ADD CONSTRAINT reject_master_changes CHECK(entity_type NOT IN ('organizations','web_master_accounts')) NOT VALID")
  assert.equal((await call('admin','PATCH','organization',{version:3,name:'Rollback'})).statusCode,500)
  assert.equal((await call('admin','GET','organization')).json().organization.name,'Testverein e.V.')
  assert.equal((await call('admin','PATCH',`master-data/accounts/${rowIds.accounts}`,{version:3,name:'Rollback'})).statusCode,500)
  assert.equal((await call('editor','GET','master-data/accounts')).json().rows[0].name,'Hauptkonto')
 }finally{await app.close();await db.end();await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end()}
})
