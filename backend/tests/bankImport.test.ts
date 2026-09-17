import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import Fastify from 'fastify'
import {Pool} from 'pg'
import {initializeDatabase} from '../src/config/database.js'
import {authenticate,sessionHash} from '../src/middleware/auth.js'
import {errorHandler} from '../src/middleware/error.js'
import webBankImportRoutes from '../src/routes/webBankImport.js'
import {parseCsvStatement} from '../src/services/bankCsv.js'
const csv='Buchungstag;Betrag;Empfänger;Verwendungszweck\n15.09.2026;-0,29;Verein;"Beitrag; Mitglied"\n15.09.2026;-0,29;Verein;"Beitrag; Mitglied"\n30.02.2026;1,00;Falsch;Datum\n'
const file={fileName:'bank.csv',fileBase64:Buffer.from(csv).toString('base64')}
test('CSV parser preserves quotes, German decimals and identical rows, rejects malformed/truncated CSV',()=>{
 const parsed=parseCsvStatement(Buffer.from(csv));assert.equal(parsed.rows.length,3);assert.equal(parsed.rows[0].amount,0.29);assert.equal(parsed.rows[0].direction,'OUT');assert.equal(parsed.rows[0].purpose,'Beitrag; Mitglied')
 assert.throws(()=>parseCsvStatement(Buffer.from('Datum;Betrag\n"offen;1')))
 assert.throws(()=>parseCsvStatement(Buffer.from('Datum;Betrag\n"offen"bad;1')))
 assert.throws(()=>parseCsvStatement(Buffer.from('Datum;Betrag\n'+Array.from({length:5001},()=> '2026-09-15;1').join('\n'))))
})
test('PostgreSQL CSV bank import: roles/tenants, identical rows and concurrent import dedupe, snapshot enforcement and single booking',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`bank_test_${randomBytes(8).toString('hex')}`;await adminPool.query(`CREATE SCHEMA ${schema}`)
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString()
 const db=await initializeDatabase(),app=Fastify()
 try{
  for(const name of ['001_initial_schema.sql','002_auth.sql','016_web_organization_memberships.sql','003_workflow.sql','019_web_booking_tags.sql','004_planning.sql','009_web_bank_import.sql','008_web_settings.sql','010_web_master_data.sql','012_web_organization_profiles.sql'])await db.query(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  const org=(await db.query("INSERT INTO organizations(name) VALUES('Bank') RETURNING id")).rows[0].id,foreign=(await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id,tokens:Record<string,string>={}
  for(const[name,role,organization]of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['foreign','ADMIN',foreign]]){
   const id=(await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[organization,`${name}@bank.invalid`,'unused',role])).rows[0].id;tokens[name]=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionHash(tokens[name]),id])
  }
  app.decorate('authenticate',authenticate);app.setErrorHandler(errorHandler);await app.register(webBankImportRoutes,{prefix:'/api'})
  const call=(who:string,method:'GET'|'POST',path:string,payload?:unknown)=>app.inject({method,url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},...(payload===undefined?{}:{payload:payload as object})})
  assert.equal((await app.inject('/api/bank-transactions')).statusCode,401)
  assert.equal((await call('user','GET','/bank-transactions')).statusCode,403)
  assert.equal((await call('editor','POST','/bank-imports/preview',file)).statusCode,403)
  const preview=await call('admin','POST','/bank-imports/preview',file);assert.equal(preview.statusCode,200,preview.body);assert.deepEqual(preview.json().summary,{total:3,valid:2,errors:1})
  assert.equal((await call('admin','POST','/bank-imports/preview',{...file,fileName:'bad.xml'})).statusCode,400)
  assert.equal((await call('admin','POST','/bank-imports/commit',{...file,paymentAccountId:1,forceImportSourceRows:[2]})).statusCode,400)
  const imports=await Promise.all([call('admin','POST','/bank-imports/commit',{...file,paymentAccountId:1}),call('admin','POST','/bank-imports/commit',{...file,paymentAccountId:1})])
  assert.ok(imports.every(result=>result.statusCode===201),imports.map(result=>result.body).join('\n'))
  assert.deepEqual(imports.map(result=>result.json().imported).sort(),[0,2]);assert.deepEqual(imports.map(result=>result.json().duplicates).sort(),[0,2]);assert.equal(imports[0].json().errors.length,1)
  const rows=(await call('editor','GET','/bank-transactions?status=OPEN')).json().rows;assert.equal(rows.length,2)
  assert.equal((await call('foreign','GET','/bank-transactions')).json().total,0)
  assert.equal((await call('editor','GET','/bank-transactions?q=Beitrag')).json().total,2)
  assert.equal((await call('editor','GET','/bank-transactions/import-status')).json().total,2)
  const id=rows[0].id,path=`/bank-transactions/${id}/book`,booking={version:1,date:'2026-09-15',type:'OUT',description:'Mitgliedsbeitrag',grossAmountCents:29,paymentMethod:'BANK',sphere:'IDEELL'}
  assert.equal((await call('editor','POST',path,booking)).statusCode,403)
  assert.equal((await call('foreign','POST',path,booking)).statusCode,404)
  assert.equal((await call('admin','POST',path,{...booking,grossAmountCents:30})).statusCode,400)
  assert.equal((await call('admin','POST',path,{...booking,type:'IN'})).statusCode,400)
  assert.equal((await call('admin','POST',path,{...booking,paymentMethod:'CASH'})).statusCode,400)
  assert.equal((await call('admin','POST',path,{...booking,date:'2026-09-14'})).statusCode,400)
  const results=await Promise.all([call('admin','POST',path,booking),call('admin','POST',path,booking)]);assert.deepEqual(results.map(result=>result.statusCode).sort(),[200,409])
  assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings')).rows[0].count),1)
  const linked=(await call('editor','GET','/bank-transactions?status=LINKED')).json().rows;assert.equal(linked.length,1);assert.ok(linked[0].voucherNo);assert.equal(linked[0].version,2)
  assert.equal((await call('admin','POST','/bank-imports/commit',{...file,paymentAccountId:1})).json().duplicates,2)
  await db.query("ALTER TABLE audit_log ADD CONSTRAINT bank_book_audit_fail CHECK(NOT(entity_type='web_bank_transactions' AND action='BOOK')) NOT VALID")
  assert.equal((await call('admin','POST',`/bank-transactions/${rows[1].id}/book`,booking)).statusCode,500)
  assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings')).rows[0].count),1)
  assert.equal((await call('editor','GET','/bank-transactions?status=OPEN')).json().total,1)
  assert.equal((await db.query('SELECT last_number FROM web_booking_sequences')).rows[0].last_number,1)
  await db.query('ALTER TABLE audit_log DROP CONSTRAINT bank_book_audit_fail')
  await db.query("INSERT INTO web_organization_profiles(organization_id,profile) VALUES($1,'GENERAL')",[org])
  const category=(await db.query("INSERT INTO web_master_data(organization_id,kind,name) VALUES($1,'categories','Office') RETURNING id",[org])).rows[0].id
  const foreignCategory=(await db.query("INSERT INTO web_master_data(organization_id,kind,name) VALUES($1,'categories','Other') RETURNING id",[foreign])).rows[0].id
  const remaining=`/bank-transactions/${rows[1].id}/book`
  assert.equal((await call('admin','POST',remaining,{...booking,primaryClassificationValueId:foreignCategory})).statusCode,400)
  const general=await call('admin','POST',remaining,{...booking,primaryClassificationValueId:category})
  assert.equal(general.statusCode,200,general.body)
  assert.equal(general.json().booking.primaryClassificationValueId,category)
 }finally{await app.close();await db.end();await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end()}
})
