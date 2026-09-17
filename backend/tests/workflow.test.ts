import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import Fastify from 'fastify'
import { Pool } from 'pg'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import workflowRoutes, { bookingFields } from '../src/routes/workflow.js'

const fields = {type:'IN',date:'2026-09-15',description:'Mitgliedsbeitrag',grossAmountCents:12500,sphere:'IDEELL',paymentMethod:'BANK'}
test('reject impossible dates, fractional/unsafe cents and unauthorized fields', () => {
  assert.equal(bookingFields.safeParse(fields).success,true)
  for (const invalid of [{date:'2026-02-30'},{grossAmountCents:1.5},{grossAmountCents:0},{grossAmountCents:Number.MAX_SAFE_INTEGER+1},{status:'APPROVED'}]) {
    assert.equal(bookingFields.safeParse({...fields,...invalid}).success,false)
  }
})

test('PostgreSQL: roles, ownership, optimistic edits and concurrent approval', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const adminPool = new Pool({connectionString:process.env.TEST_DATABASE_URL})
  const schema = `workflow_test_${randomBytes(8).toString('hex')}`
  await adminPool.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(process.env.TEST_DATABASE_URL!)
  url.searchParams.set('options',`-c search_path=${schema}`)
  process.env.DATABASE_URL = url.toString()
  const db = await initializeDatabase()
  const app = Fastify()
  try {
    for (const file of ['001_initial_schema.sql','002_auth.sql','016_web_organization_memberships.sql','003_workflow.sql','019_web_booking_tags.sql','004_planning.sql','006_web_attachments.sql','008_web_settings.sql','010_web_master_data.sql']) {
      await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
    }
    const org = (await db.query("INSERT INTO organizations(name) VALUES ('Test') RETURNING id")).rows[0].id
    const secondOrg = (await db.query("INSERT INTO organizations(name) VALUES ('Other') RETURNING id")).rows[0].id
    const tokens: Record<string,string> = {}
    for (const [name,role,organization] of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['other','USER',org],['foreign','ADMIN',secondOrg]]) {
      const id = (await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id',[organization,`${name}@test.invalid`,'unused',role])).rows[0].id
      tokens[name] = randomBytes(32).toString('hex')
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')",[sessionHash(tokens[name]),id])
    }
    app.decorate('authenticate',authenticate)
    app.setErrorHandler(errorHandler)
    await app.register(workflowRoutes,{prefix:'/api'})
    const call = (who:string,method:'GET'|'POST'|'PATCH',path:string,payload?:unknown) => app.inject({method,url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},...(payload === undefined ? {} : {payload:payload as object})})
    assert.equal((await app.inject('/api/drafts')).statusCode,401)
    assert.equal((await call('user','POST','/bookings',fields)).statusCode,403)
    assert.equal((await call('user','GET','/bookings')).statusCode,403)
    for (const unsafe of [{status:'APPROVED'},{createdBy:1},{organizationId:secondOrg},{version:999},{sourceDraftId:1}]) {
      assert.equal((await call('user','POST','/drafts',{...fields,...unsafe})).statusCode,400)
    }
    const created = await call('user','POST','/drafts',{...fields,tags:[' Training ','training','Neu']})
    assert.equal(created.statusCode,201)
    const draft = created.json().draft
    assert.equal(draft.date,fields.date)
    assert.deepEqual(draft.tags,['Training','Neu'])
    assert.deepEqual((await call('user','GET','/tags')).json().rows,[], 'draft tags do not create global master data')
    assert.equal((await call('user','PATCH',`/drafts/${draft.id}`,{version:1,status:'APPROVED'})).statusCode,400)
    assert.equal((await call('foreign','PATCH',`/drafts/${draft.id}`,{version:1,description:'Other organization'})).statusCode,404)
    assert.equal((await call('editor','POST',`/drafts/${draft.id}/submit`,{version:1})).statusCode,403)
    assert.equal((await call('other','GET','/drafts')).json().drafts.length,0)
    assert.equal((await call('other','PATCH',`/drafts/${draft.id}`,{version:1,description:'Tamper'})).statusCode,404)
    assert.equal((await call('foreign','POST',`/drafts/${draft.id}/approve`,{version:1})).statusCode,404)
    assert.equal((await call('user','POST',`/drafts/${draft.id}/approve`,{version:1})).statusCode,403)
    assert.equal((await call('editor','POST',`/drafts/${draft.id}/approve`,{version:1})).statusCode,409)
    assert.equal((await call('user','POST',`/drafts/${draft.id}/submit`,{version:1})).statusCode,200)
    assert.equal((await call('user','PATCH',`/drafts/${draft.id}`,{version:2,description:'Late'})).statusCode,409)
    assert.equal((await call('editor','POST',`/drafts/${draft.id}/return`,{version:2,reason:'Bitte korrigieren'})).statusCode,200)
    assert.equal((await call('user','PATCH',`/drafts/${draft.id}`,{version:3,description:'Korrigiert'})).statusCode,200)
    assert.equal((await call('user','POST',`/drafts/${draft.id}/submit`,{version:4})).statusCode,200)
    const edited=await call('editor','PATCH',`/drafts/${draft.id}`,{version:5,tags:['Training','Neu','Geprüft'],counterparty:'Ergänzter Lieferant'})
    assert.equal(edited.statusCode,200,edited.body);assert.equal(edited.json().draft.status,'SUBMITTED')
    assert.equal((await call('admin','POST',`/drafts/${draft.id}/approve`,{version:5})).statusCode,409)
    assert.equal((await call('admin','PATCH',`/drafts/${draft.id}`,{version:6,description:'Geprüfte Buchung'})).statusCode,200)
    const approvals = await Promise.all([call('editor','POST',`/drafts/${draft.id}/approve`,{version:7}),call('admin','POST',`/drafts/${draft.id}/approve`,{version:7})])
    assert.deepEqual(approvals.map(r=>r.statusCode).sort(),[200,409])
    const booking = approvals.find(r=>r.statusCode===200)!.json().booking
    assert.deepEqual(booking.tags,['Training','Neu','Geprüft'])
    assert.equal(booking.counterparty,'Ergänzter Lieferant')
    assert.equal(booking.description,'Geprüfte Buchung')
    for(const role of ['admin','editor','user'])assert.equal((await call(role,'PATCH',`/drafts/${draft.id}`,{version:8,tags:[]})).statusCode,409)
    assert.equal((await call('editor','GET','/tags')).json().rows.length,3)
    assert.deepEqual((await call('foreign','GET','/tags')).json().rows,[])
    assert.equal((await call('foreign','GET','/bookings')).json().bookings.length,0)
    assert.equal((await call('foreign','PATCH',`/bookings/${booking.id}`,{version:1,description:'Cross org'})).statusCode,404)
    assert.equal((await call('admin','PATCH',`/bookings/${booking.id}`,{version:1,number:'REPLACED'})).statusCode,400)
    assert.equal((await call('user','POST',`/drafts/${draft.id}/submit`,{version:6})).statusCode,409)
    assert.equal((await call('editor','PATCH',`/bookings/${booking.id}`,{version:1,description:'Forbidden'})).statusCode,403)
    assert.equal((await call('admin','PATCH',`/bookings/${booking.id}`,{version:1,description:'Updated',tags:['Neu','training']})).statusCode,200)
    assert.equal((await call('admin','PATCH',`/bookings/${booking.id}`,{version:1,description:'Stale'})).statusCode,409)
    const parallel = await Promise.all(Array.from({length:8},()=>call('editor','POST','/bookings',{...fields,tags:['Parallel']})))
    assert.ok(parallel.every(r=>r.statusCode===201))
    assert.ok(parallel.every(r=>r.json().booking.tags[0]==='Parallel'))
    assert.equal((await call('editor','GET','/tags')).json().rows.filter((tag:any)=>tag.name==='Parallel').length,1)
    assert.equal(new Set([booking.number,...parallel.map(r=>r.json().booking.number)]).size,9)
    assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings WHERE source_draft_id=$1',[draft.id])).rows[0].count),1)
    assert.equal(Number((await db.query("SELECT count(*) FROM audit_log WHERE entity_type='web_drafts' AND action='APPROVE'")).rows[0].count),1)
    // Assignment updates are part of the same optimistic booking transaction.
    const budget = (await db.query("INSERT INTO web_budgets(organization_id,name,year,sphere,amount_planned_cents) VALUES($1,'Training',2026,'IDEELL',100000) RETURNING id", [org])).rows[0].id
    const foreignBudget = (await db.query("INSERT INTO web_budgets(organization_id,name,year,sphere,amount_planned_cents) VALUES($1,'Foreign',2026,'IDEELL',100000) RETURNING id", [secondOrg])).rows[0].id
    const assigned = await call('admin','PATCH',`/bookings/${booking.id}`,{version:2,budgets:[{budgetId:budget,amount:100}]})
    assert.equal(assigned.statusCode,200)
    assert.equal(assigned.json().booking.budgets[0].amount,100)
    assert.equal((await call('admin','PATCH',`/bookings/${booking.id}`,{version:3,budgets:[{budgetId:foreignBudget,amount:100}]})).statusCode,404)
    assert.equal((await call('admin','PATCH',`/bookings/${booking.id}`,{version:3,grossAmountCents:5000})).statusCode,400)
    const unchanged = (await call('admin','GET','/bookings')).json().bookings.find((row:any)=>row.id===booking.id)
    assert.deepEqual(unchanged.tags,['Neu','Training'])
    assert.equal(unchanged.version,3)
    assert.equal(unchanged.grossAmountCents,12500)
    assert.equal(unchanged.budgets[0].amount,100)
    assert.equal((await call('user','POST','/drafts',{...fields,budgets:[{budgetId:budget,amount:100}]})).statusCode,400)
    // Invalid creation rolls back the record and reference allocation together.
    assert.equal((await call('editor','POST','/bookings',{...fields,budgets:[{budgetId:foreignBudget,amount:100}]})).statusCode,404)
    // A failed audit must roll back the booking and its allocated sequence number.
    await db.query("ALTER TABLE audit_log ADD CONSTRAINT reject_booking_audit CHECK (entity_type <> 'web_bookings') NOT VALID")
    assert.equal((await call('editor','POST','/bookings',fields)).statusCode,500)
    assert.equal(Number((await db.query('SELECT count(*) FROM web_bookings')).rows[0].count),9)
    assert.equal((await db.query('SELECT last_number FROM web_booking_sequences')).rows[0].last_number,9)
  } finally {
    await app.close()
    await db.end()
    await adminPool.query(`DROP SCHEMA ${schema} CASCADE`)
    await adminPool.end()
  }
})
