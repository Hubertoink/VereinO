import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import Fastify from 'fastify'
import { Pool } from 'pg'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import planningRoutes from '../src/routes/planning.js'
import { saveBookingAssignments, readBookingAssignments, assignmentAmount } from '../src/services/planning.js'

test('assignment precision is validated before cents conversion',()=>{
  assert(assignmentAmount.safeParse(0.29).success)
  for(const value of [0,-1,0.001,Infinity,Number.MAX_SAFE_INTEGER])assert(!assignmentAmount.safeParse(value).success)
})
test('PostgreSQL planning: roles, tenants, conflicts, assignment validation and actual usage', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL})
 const schema=`planning_test_${randomBytes(8).toString('hex')}`
 await adminPool.query(`CREATE SCHEMA ${schema}`)
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString()
 const db=await initializeDatabase(),app=Fastify()
 try{
  for(const file of ['001_initial_schema.sql','002_auth.sql','016_web_organization_memberships.sql','003_workflow.sql','019_web_booking_tags.sql','004_planning.sql'])await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
  const org=(await db.query("INSERT INTO organizations(name) VALUES('Planning') RETURNING id")).rows[0].id
  const foreignOrg=(await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id
  const tokens:Record<string,string>={},users:Record<string,number>={}
  for(const [name,role,tenant] of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['foreign','ADMIN',foreignOrg]]){
   users[name]=(await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[tenant,`${name}@planning.invalid`,'unused',role])).rows[0].id
   tokens[name]=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[sessionHash(tokens[name]),users[name]])
  }
  app.decorate('authenticate',authenticate);app.setErrorHandler(errorHandler);await app.register(planningRoutes,{prefix:'/api'})
  const call=(who:string,method:'GET'|'POST'|'PATCH'|'DELETE',path:string,payload?:object)=>app.inject({method,url:`/api/planning${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},...(payload?{payload}:{})})
  const budget={name:'Training',year:2026,sphere:'IDEELL',amountPlanned:250,enforceTimeRange:true}
  assert.equal((await app.inject('/api/planning/budgets')).statusCode,401)
  assert.equal((await call('user','GET','/budgets')).statusCode,403)
  assert.equal((await call('editor','POST','/budgets',budget)).statusCode,403)
  const created=await call('admin','POST','/budgets',budget);assert.equal(created.statusCode,201,created.body);const b=created.json().row
  const earmark=(await call('admin','POST','/earmarks',{name:'Jugend',code:'JUG',budget:1000})).json().row
  assert.equal((await call('foreign','GET','/budgets')).json().rows.length,0)
  assert.equal((await call('foreign','PATCH',`/budgets/${b.id}`,{...budget,version:1})).statusCode,404)
  assert.equal((await call('editor','GET','/budgets')).json().rows[0].amountPlanned,250)
  assert.equal((await call('admin','PATCH',`/budgets/${b.id}`,{...budget,version:9})).statusCode,409)
  const foreign=(await call('foreign','POST','/budgets',budget)).json().row
  const booking=(await db.query("INSERT INTO web_bookings(organization_id,created_by,number,type,date,description,gross_amount_cents,sphere,payment_method) VALUES($1,$2,'2026-1','OUT','2026-09-15','Training',10000,'IDEELL','BANK') RETURNING id",[org,users.admin])).rows[0].id
  async function assign(input:any,date='2026-09-15',grossAmountCents=10000){const client=await db.connect();try{await client.query('BEGIN');await saveBookingAssignments(client,org,booking,input,{date,grossAmountCents});await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
  await assert.rejects(assign({budgets:[{budgetId:foreign.id,amount:20}]}),/nicht gefunden/)
  await assert.rejects(assign({budgets:[{budgetId:b.id,amount:120}]}),/übersteigt/)
  await assert.rejects(assign({budgets:[{budgetId:b.id,amount:20},{budgetId:b.id,amount:20}]}),/doppelt/)
  await assert.rejects(assign({budgets:[{budgetId:b.id,amount:20}]},'2027-01-01'),/außerhalb/)
  await assign({budgets:[{budgetId:b.id,amount:75.29}],earmarksAssigned:[{earmarkId:earmark.id,amount:50}]})
  await assert.rejects(assign({budgets:[{budgetId:b.id,amount:1}],earmarksAssigned:[{earmarkId:999999,amount:1}]}),/nicht gefunden/)
  const enrichment=await readBookingAssignments(db,org,[booking]);assert.equal(enrichment[booking].budgets[0].amount,75.29)
  assert.equal((await call('editor','GET',`/budgets/${b.id}/usage`)).json().spent,75.29)
  const usage=(await call('editor','GET',`/earmarks/${earmark.id}/usage`)).json();assert.equal(usage.released,50);assert.equal(usage.remaining,950)
  assert.equal((await call('foreign','GET',`/budgets/${b.id}/usage`)).statusCode,404)
  assert.equal((await call('admin','DELETE',`/budgets/${b.id}`,{version:1})).statusCode,409)
  assert.equal((await call('admin','PATCH',`/budgets/${b.id}`,{...budget,isArchived:true,version:1})).statusCode,200)
  await assign({budgets:[{budgetId:b.id,amount:70}]}) // Retained archived assignment may be edited.
  await assert.rejects(assign({},'2026-09-15',1000),/übersteigt/)
  await assign({budgets:[]})
  await assert.rejects(assign({budgets:[{budgetId:b.id,amount:10}]}),/Archivierte/)
  assert.equal((await call('admin','DELETE',`/budgets/${b.id}`,{version:2})).statusCode,200)
 }finally{await app.close();await db.end();await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end()}
})
