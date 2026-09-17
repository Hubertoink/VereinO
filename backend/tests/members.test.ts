import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import Fastify from 'fastify'
import { Pool } from 'pg'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import webMembersRoutes, { memberFields } from '../src/routes/webMembers.js'

const member = {name:'Erika Muster',memberNo:'M001',join_date:'2026-09-15',status:'ACTIVE',email:'erika@example.org',notes:'Test'}
test('member input rejects impossible dates, unsafe fields and fractional contribution precision', () => {
  assert.equal(memberFields.safeParse(member).success,true)
  assert.equal(memberFields.safeParse({...member,contribution_amount:0.29}).success,true)
  for (const invalid of [{join_date:'2026-02-30'},{name:' '},{organizationId:99},{contribution_amount:0.001},{status:'ADMIN'}]) {
    assert.equal(memberFields.safeParse({...member,...invalid}).success,false)
  }
})
test('PostgreSQL members: role enforcement, tenant isolation, CRUD, search and optimistic updates', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const adminPool = new Pool({connectionString:process.env.TEST_DATABASE_URL})
  const schema = `members_test_${randomBytes(8).toString('hex')}`
  await adminPool.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(process.env.TEST_DATABASE_URL!)
  url.searchParams.set('options',`-c search_path=${schema}`)
  process.env.DATABASE_URL = url.toString()
  const db = await initializeDatabase()
  const app = Fastify()
  try {
    for (const file of ['001_initial_schema.sql','002_auth.sql','016_web_organization_memberships.sql','005_web_members.sql']) await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
    const org = (await db.query("INSERT INTO organizations(name) VALUES('Members Test') RETURNING id")).rows[0].id
    const foreignOrg = (await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id
    const tokens: Record<string,string> = {}
    for (const [name,role,organization] of [['admin','ADMIN',org],['editor','EDITOR',org],['user','USER',org],['foreign','ADMIN',foreignOrg]]) {
      const id = (await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[organization,`${name}@members.invalid`,'unused',role])).rows[0].id
      tokens[name] = randomBytes(32).toString('hex')
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[sessionHash(tokens[name]),id])
    }
    app.decorate('authenticate',authenticate)
    app.setErrorHandler(errorHandler)
    await app.register(webMembersRoutes,{prefix:'/api'})
    const call = (who:string,method:'GET'|'POST'|'PATCH'|'DELETE',path='/members',payload?:unknown) => app.inject({method,url:`/api${path}`,headers:{cookie:`vereino_session=${tokens[who]}`},...(payload === undefined ? {} : {payload:payload as object})})
    assert.equal((await app.inject('/api/members')).statusCode,401)
    assert.equal((await call('user','GET')).statusCode,403)
    assert.equal((await call('editor','POST','/members',member)).statusCode,403)
    const create = await call('admin','POST','/members',member)
    assert.equal(create.statusCode,201,create.body)
    const created = create.json()
    assert.equal(created.name,member.name)
    assert.equal(created.join_date,member.join_date)
    assert.equal(created.version,1)
    const path = `/members/${created.id}`
    assert.equal((await call('editor','GET',path)).json().email,member.email)
    assert.equal((await call('user','GET',path)).statusCode,403)
    assert.equal((await call('foreign','GET',path)).statusCode,404)
    assert.equal((await call('foreign','GET')).json().total,0)
    assert.equal((await call('editor','PATCH',path,{...member,version:1})).statusCode,403)
    assert.equal((await call('editor','DELETE',path,{version:1})).statusCode,403)
    assert.equal((await call('foreign','PATCH',path,{...member,version:1})).statusCode,404)
    assert.equal((await call('foreign','DELETE',path,{version:1})).statusCode,404)
    assert.equal((await call('admin','POST','/members',member)).statusCode,409)
    // Number uniqueness is scoped to the organization.
    assert.equal((await call('foreign','POST','/members',member)).statusCode,201)
    const updated = await call('admin','PATCH',path,{...member,version:1,status:'PAUSED',notes:'Changed',boardRole:'V1',contribution_amount:0.29})
    assert.equal(updated.statusCode,200,updated.body)
    assert.equal(updated.json().version,2)
    assert.equal(updated.json().contribution_amount,0.29)
    assert.equal((await call('admin','PATCH',path,{...member,version:1})).statusCode,409)
    assert.equal((await call('admin','DELETE',path,{version:1})).statusCode,409)
    assert.equal((await call('editor','GET','/members?q=Erika&status=PAUSED')).json().total,1)
    assert.equal((await call('editor','GET','/members?status=ACTIVE')).json().total,0)
    assert.equal((await call('editor','GET','/members?q=%25')).json().total,0)
    assert.equal((await call('editor','GET','/members?boardFilter=V1')).json().total,1)
    assert.equal((await call('admin','POST','/members',{...member,memberNo:'M002',boardRole:'V1'})).statusCode,409)
    assert.equal((await call('admin','DELETE',path,{version:2})).statusCode,200)
    assert.equal((await call('editor','GET',path)).statusCode,404)
    assert.equal((await call('editor','GET')).json().total,0)
    assert.equal(Number((await db.query("SELECT count(*) FROM audit_log WHERE entity_type='web_members' AND organization_id=$1",[org])).rows[0].count),3)
    // Changes and audit are one transaction.
    await db.query("ALTER TABLE audit_log ADD CONSTRAINT reject_member_audit CHECK(entity_type <> 'web_members') NOT VALID")
    assert.equal((await call('admin','POST','/members',member)).statusCode,500)
    assert.equal((await call('editor','GET')).json().total,0)
  } finally {
    await app.close()
    await db.end()
    await adminPool.query(`DROP SCHEMA ${schema} CASCADE`)
    await adminPool.end()
  }
})
