import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import Fastify from 'fastify'
import { Pool } from 'pg'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import webRecurringRoutes, { recurringFields } from '../src/routes/webRecurring.js'
import { nextOccurrence, dueCount } from '../src/services/recurring.js'
const fields={name:'Vereinssoftware',type:'OUT',sphere:'IDEELL',description:'Software',grossAmountCents:29,paymentMethod:'BANK',frequency:'MONTHLY',startDate:'2020-01-31',nextDueDate:'2020-01-31',endDate:'2020-02-29',status:'ACTIVE',variableAmount:false}
test('recurring calendar keeps original month-day and leap-year anchors',()=>{
 assert.equal(nextOccurrence('2020-01-31','MONTHLY','2020-01-31'),'2020-02-29')
 assert.equal(nextOccurrence('2020-02-29','MONTHLY','2020-01-31'),'2020-03-31')
 assert.equal(nextOccurrence('2020-02-29','YEARLY','2020-02-29'),'2021-02-28')
 assert.equal(nextOccurrence('2023-02-28','YEARLY','2020-02-29'),'2024-02-29')
 assert.equal(nextOccurrence('2020-12-28','WEEKLY','2020-12-28'),'2021-01-04')
 assert.equal(dueCount('2020-01-31','2026-09-15','MONTHLY','2020-01-31','2020-02-29'),2)
 for(const invalid of [{nextDueDate:'2020-02-30'},{grossAmountCents:1.5},{organizationId:99},{frequency:'DAILY'}])assert.equal(recurringFields.safeParse({...fields,...invalid}).success,false)
})
test('PostgreSQL recurring: roles, org scope, optimistic edits, concurrent occurrence execution and audit rollback',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL})
 const schema=`recurring_test_${randomBytes(8).toString('hex')}`
 await adminPool.query(`CREATE SCHEMA ${schema}`)
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString()
 const db=await initializeDatabase(),app=Fastify()
 try{
  for(const file of ['001_initial_schema.sql','002_auth.sql','016_web_organization_memberships.sql','003_workflow.sql','019_web_booking_tags.sql','004_planning.sql','007_web_recurring.sql','008_web_settings.sql','010_web_master_data.sql','012_web_organization_profiles.sql'])await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
  const org=(await db.query("INSERT INTO organizations(name) VALUES('Recurring') RETURNING id")).rows[0].id
  const foreignOrg=(await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id
  const tokens:Record<string,string>={}
  for(const[name,role,organization]of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['foreign','ADMIN',foreignOrg]]){
   const id=(await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[organization,`${name}@recurring.invalid`,'unused',role])).rows[0].id
   tokens[name]=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionHash(tokens[name]),id])
  }
  app.decorate('authenticate',authenticate);app.setErrorHandler(errorHandler);await app.register(webRecurringRoutes,{prefix:'/api'})
  const call=(who:string,method:'GET'|'POST'|'PATCH',path='/recurring',payload?:unknown)=>app.inject({method,url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},...(payload===undefined?{}:{payload:payload as object})})
  assert.equal((await app.inject('/api/recurring')).statusCode,401)
  assert.equal((await call('user','GET')).statusCode,403)
  assert.equal((await call('editor','POST','/recurring',fields)).statusCode,403)
  const create=await call('admin','POST','/recurring',fields);assert.equal(create.statusCode,201,create.body)
  const row=create.json().row,path=`/recurring/${row.id}`
  assert.equal(row.dueCount,2);assert.equal(row.nextDueDate,'2020-01-31')
  assert.equal((await call('editor','GET')).json().rows.length,1)
  assert.equal((await call('foreign','GET')).json().rows.length,0)
  assert.equal((await call('editor','GET','/recurring?q=software')).json().rows.length,1)
  assert.equal((await call('editor','GET','/recurring/summary')).json().due,2)
  assert.equal((await call('foreign','PATCH',path,{...fields,version:1})).statusCode,404)
  assert.equal((await call('editor','PATCH',path,{...fields,version:1})).statusCode,403)
  assert.equal((await call('admin','PATCH',path,{...fields,name:'Updated',version:1})).statusCode,200)
  assert.equal((await call('admin','PATCH',path,{...fields,version:1})).statusCode,409)
  const book={version:2,expectedDueDate:'2020-01-31',bookingDate:'2020-01-31',grossAmountCents:29}
  assert.equal((await call('editor','POST',`${path}/book`,book)).statusCode,403)
  assert.equal((await call('foreign','POST',`${path}/book`,book)).statusCode,404)
  const concurrent=await Promise.all([call('admin','POST',`${path}/book`,book),call('admin','POST',`${path}/book`,book)])
  assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,409])
  const booked=concurrent.find(r=>r.statusCode===200)!.json()
  assert.equal(booked.booking.grossAmountCents,29);assert.equal(booked.row.nextDueDate,'2020-02-29');assert.equal(booked.row.version,3)
  assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings')).rows[0].count),1)
  assert.equal(Number((await db.query('SELECT count(*) FROM web_recurring_occurrences')).rows[0].count),1)
  assert.equal((await call('admin','PATCH',path,{...fields,version:3})).statusCode,409)
  const skip=await call('admin','POST',`${path}/skip`,{version:3,expectedDueDate:'2020-02-29'})
  assert.equal(skip.statusCode,200,skip.body);assert.equal(skip.json().row.status,'ENDED');assert.equal(skip.json().row.nextDueDate,'2020-03-31')
  assert.equal((await call('admin','PATCH',`${path}/status`,{version:4,status:'ACTIVE'})).statusCode,409)
  assert.equal((await call('admin','POST',`${path}/book`,{...book,version:4,expectedDueDate:'2020-03-31'})).statusCode,409)
  const fresh=(await call('admin','POST','/recurring',{...fields,endDate:null})).json().row
  assert.equal((await call('admin','PATCH',`/recurring/${fresh.id}/status`,{version:1,status:'PAUSED'})).statusCode,200)
  assert.equal((await call('admin','POST',`/recurring/${fresh.id}/book`,{...book,version:2})).statusCode,409)
  assert.equal((await call('admin','PATCH',`/recurring/${fresh.id}/status`,{version:2,status:'ACTIVE'})).statusCode,200)
  await db.query("ALTER TABLE audit_log ADD CONSTRAINT reject_recurring_book CHECK (NOT(entity_type='web_recurring' AND action='BOOK')) NOT VALID")
  assert.equal((await call('admin','POST',`/recurring/${fresh.id}/book`,{...book,version:3})).statusCode,500)
  assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings')).rows[0].count),1)
  assert.equal((await db.query('SELECT last_number FROM web_booking_sequences')).rows[0].last_number,1)
  assert.equal((await db.query('SELECT version FROM web_recurring WHERE id=$1',[fresh.id])).rows[0].version,3)
  await db.query("ALTER TABLE audit_log DROP CONSTRAINT reject_recurring_book")
  await db.query("INSERT INTO web_organization_profiles(organization_id,profile) VALUES($1,'GENERAL')",[org])
  const category=(await db.query("INSERT INTO web_master_data(organization_id,kind,name) VALUES($1,'categories','Office') RETURNING id",[org])).rows[0].id
  const foreignCategory=(await db.query("INSERT INTO web_master_data(organization_id,kind,name) VALUES($1,'categories','Foreign') RETURNING id",[foreignOrg])).rows[0].id
  assert.equal((await call('admin','POST','/recurring',{...fields,primaryClassificationValueId:foreignCategory})).statusCode,400)
  const general=await call('admin','POST','/recurring',{...fields,primaryClassificationValueId:category})
  assert.equal(general.statusCode,201,general.body)
  const generalId=general.json().row.id
  assert.equal((await call('admin','GET')).json().rows.find((r:any)=>r.id===generalId).primaryClassificationName,'Office')
  await db.query("UPDATE web_organization_profiles SET profile='NONPROFIT' WHERE organization_id=$1",[org])
  await db.query('UPDATE web_master_data SET is_active=false WHERE id=$1',[category])
  const generalBooking=await call('admin','POST',`/recurring/${generalId}/book`,{...book,version:1})
  assert.equal(generalBooking.statusCode,200,generalBooking.body)
  assert.equal(generalBooking.json().booking.primaryClassificationValueId,category)
 }finally{await app.close();await db.end();await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end()}
})
