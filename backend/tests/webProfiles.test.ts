import { bindAiDocument } from '../src/services/aiDocuments.js'
import { webAiContext } from '../src/services/aiContext.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import Fastify from 'fastify'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import webAi from '../src/routes/webAi.js'
import authRoutes from '../src/routes/auth.js'
import webProfiles, { profilePatchSchema } from '../src/routes/webProfiles.js'
import { savePrimaryClassification, addPrimaryClassificationLabels } from '../src/services/webClassification.js'

test('profile input rejects unknown modes, tenant overrides and invalid versions', () => {
  assert(profilePatchSchema.safeParse({ profile: 'GENERAL', version: 0 }).success)
  for (const patch of [{ profile: 'OTHER' }, { version: -1 }, { organizationId: 2 }])
    assert(!profilePatchSchema.safeParse({ profile: 'NONPROFIT', version: 1, ...patch }).success)
})

test('PostgreSQL profiles: roles, tenant-scoped categories, optimistic writes and audit', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  const schema = `profiles_${randomBytes(8).toString('hex')}`
  await pool.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(process.env.TEST_DATABASE_URL!)
  url.searchParams.set('options', `-c search_path=${schema}`)
  process.env.DATABASE_URL = url.toString()
  const db = await initializeDatabase()
  const app = Fastify()
  try {
    for (const file of ['001_initial_schema.sql', '002_auth.sql','016_web_organization_memberships.sql', '003_workflow.sql','019_web_booking_tags.sql', '006_web_attachments.sql', '008_web_settings.sql', '010_web_master_data.sql', '012_web_organization_profiles.sql', '013_web_ai.sql', '014_web_ai_documents.sql'])
      await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
    app.decorate('authenticate', authenticate)
    app.setErrorHandler(errorHandler)
    await app.register(authRoutes)
    await app.register(webProfiles)
    await app.register(webAi)
    const previousToken = process.env.SETUP_TOKEN
    process.env.SETUP_TOKEN = randomBytes(32).toString('hex')
    try {
      const payload = { organizationName: 'General setup', email: 'setup@test.invalid', password: 'isolated-test-password', setupToken: process.env.SETUP_TOKEN, profile: 'GENERAL' }
      assert.equal((await app.inject({ method: 'POST', url: '/auth/setup', payload: { ...payload, profile: 'INVALID' } })).statusCode, 400)
      const setup = await app.inject({ method: 'POST', url: '/auth/setup', payload })
      assert.equal(setup.statusCode, 201)
      const profile = (await db.query('SELECT profile FROM web_organization_profiles WHERE organization_id=$1', [setup.json().user.organizationId])).rows[0]
      assert.equal(profile.profile, 'GENERAL')
      assert.equal((await app.inject({ method: 'POST', url: '/auth/setup', payload })).statusCode, 409)
    } finally {
      if (previousToken === undefined) delete process.env.SETUP_TOKEN
      else process.env.SETUP_TOKEN = previousToken
    }
    const org = (await db.query("INSERT INTO organizations(name) VALUES('Profile test') RETURNING id")).rows[0].id
    const foreign = (await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")).rows[0].id
    const tokens: Record<string, string> = {}
    for (const [name, role, tenant] of [['admin', 'ADMIN', org], ['editor', 'EDITOR', org], ['user', 'USER', org], ['foreign', 'ADMIN', foreign]]) {
      const user = (await db.query('INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id', [tenant, `${name}@test.invalid`, 'unused', role])).rows[0].id
      tokens[name] = randomBytes(32).toString('hex')
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessionHash(tokens[name]), user])
    }
    await db.query("INSERT INTO web_master_data(organization_id,kind,name,is_active) VALUES($1,'categories','Office',true),($1,'categories','Archived',false),($1,'tags','Tag',true),($2,'categories','Foreign category',true)", [org, foreign])
    const call = (who: string, method: 'GET' | 'PATCH', path: string, payload?: object) => app.inject({ method, url: path, headers: { cookie: `vereino_session=${tokens[who]}` }, ...(payload ? { payload } : {}) })
    const previousEncryptionKey = process.env.AI_ENCRYPTION_KEY
    process.env.AI_ENCRYPTION_KEY = randomBytes(32).toString('hex')
    try {
      const settings = { version: 0, enabled: true, provider: 'openai', model: 'test-model', textModel: 'test-text', apiKey: 'isolated-secret-value' }
      for (const who of ['editor', 'user']) assert.equal((await call(who, 'PATCH', '/ai/settings', settings)).statusCode, 403)
      const saved = await call('admin', 'PATCH', '/ai/settings', settings)
      assert.equal(saved.statusCode, 200)
      assert.equal(saved.json().hasApiKey, true)
      assert(!saved.body.includes(settings.apiKey))
      assert.equal((await call('foreign', 'GET', '/ai/settings')).json().hasApiKey, false)
      assert.equal((await call('admin', 'PATCH', '/ai/settings', settings)).statusCode, 409)
      assert.equal((await call('admin', 'PATCH', '/ai/settings', { ...settings, version: 1, provider: 'mittwald', apiKey: undefined })).statusCode, 400)
      const stored = (await db.query('SELECT encrypted_api_key FROM web_ai_settings WHERE organization_id=$1', [org])).rows[0].encrypted_api_key
      assert(!stored.includes(settings.apiKey))
      const audit = (await db.query("SELECT changes FROM audit_log WHERE entity_type='web_ai_settings' AND organization_id=$1", [org])).rows
      assert(!JSON.stringify(audit).includes(settings.apiKey))
    } finally {
      if (previousEncryptionKey === undefined) delete process.env.AI_ENCRYPTION_KEY
      else process.env.AI_ENCRYPTION_KEY = previousEncryptionKey
    }
    assert.equal((await app.inject('/settings/profile')).statusCode, 401)
    assert.equal((await call('user', 'GET', '/settings/profile')).json().profile, 'NONPROFIT')
    for (const who of ['user', 'editor']) assert.equal((await call(who, 'PATCH', '/settings/profile', { profile: 'GENERAL', version: 0 })).statusCode, 403)
    const results = await Promise.all([call('admin', 'PATCH', '/settings/profile', { profile: 'GENERAL', version: 0 }), call('admin', 'PATCH', '/settings/profile', { profile: 'GENERAL', version: 0 })])
    assert.deepEqual(results.map(r => r.statusCode).sort(), [409, 409])
    await db.query("INSERT INTO web_organization_profiles(organization_id,profile) VALUES($1,'GENERAL')", [org])
    const primary = (await call('user', 'GET', '/classifications/primary')).json()
    assert.equal(primary.profile, 'GENERAL')
    assert.equal(primary.definition.primaryLabel, 'Kategorie')
    assert.deepEqual(primary.values.map((v: { name: string }) => v.name), ['Office'])
    const creator = (await db.query("SELECT id FROM users WHERE organization_id=$1 AND role='ADMIN' LIMIT 1", [org])).rows[0].id
    const bookingId = (await db.query("INSERT INTO web_bookings(organization_id,created_by,number,type,date,description,gross_amount_cents,sphere,payment_method) VALUES($1,$2,'2026-1','IN','2026-09-16','Classification test',100,'IDEELL','BANK') RETURNING id", [org, creator])).rows[0].id
    const owner = (await db.query("SELECT id FROM users WHERE organization_id=$1 AND role='USER'", [org])).rows[0].id
    for (const [author, description] of [[owner, 'Own draft'], [creator, 'Other draft']]) await db.query("INSERT INTO web_drafts(organization_id,created_by,type,date,description,gross_amount_cents,sphere,payment_method) VALUES($1,$2,'IN','2026-09-16',$3,100,'IDEELL','BANK')", [org, author, description])
    const ownContext = await webAiContext(db, { userId: owner, organizationId: org, role: 'USER', email: 'user@test.invalid' })
    assert.deepEqual(ownContext.drafts?.map(row => row.description), ['Own draft'])
    assert.equal(ownContext.bookings, undefined)
    const editorContext = await webAiContext(db, { userId: creator, organizationId: org, role: 'EDITOR', email: 'editor@test.invalid' })
    assert.deepEqual(editorContext.bookings?.map(row => row.id), [bookingId])
    const foreignContext = await webAiContext(db, { userId: creator, organizationId: foreign, role: 'ADMIN', email: 'foreign@test.invalid' })
    assert.deepEqual(foreignContext.bookings, [])
    const documentId = randomUUID()
    await db.query("INSERT INTO web_ai_documents(id,organization_id,uploaded_by,file_name,mime_type,size,data) VALUES($1,$2,$3,'invoice.pdf','application/pdf',3,$4)", [documentId, org, owner, Buffer.from('pdf')])
    const draftId = (await db.query('SELECT id FROM web_drafts WHERE organization_id=$1 AND created_by=$2', [org, owner])).rows[0].id
    const client = await db.connect()
    try {
      const actor = { userId: owner, organizationId: org, role: 'USER' as const, email: 'user@test.invalid' }
      await assert.rejects(bindAiDocument(client, {...actor, userId: creator}, documentId, { draftId }))
      await assert.rejects(bindAiDocument(client, {...actor, organizationId: foreign}, documentId, { draftId }))
      await bindAiDocument(client, actor, documentId, { draftId })
      await assert.rejects(bindAiDocument(client, actor, documentId, { draftId }))
      await bindAiDocument(client, {...actor, userId: creator, role: 'EDITOR'}, documentId, { bookingId, sourceDraftId: draftId })
      const attached = (await db.query('SELECT data,booking_id FROM web_attachments WHERE id=$1', [documentId])).rows[0]
      assert.equal(attached.booking_id, bookingId)
      assert.equal(attached.data.toString(), 'pdf')
      await assert.rejects(bindAiDocument(client, actor, documentId, { bookingId, sourceDraftId: draftId }))
      await savePrimaryClassification(client, org, 'web_bookings', bookingId, primary.values[0].id)
      const other = (await db.query("SELECT id FROM web_master_data WHERE organization_id=$1", [foreign])).rows[0].id
      await assert.rejects(savePrimaryClassification(client, org, 'web_bookings', bookingId, other))
      const tag = (await db.query("SELECT id FROM web_master_data WHERE organization_id=$1 AND kind='tags'", [org])).rows[0].id
      await assert.rejects(savePrimaryClassification(client, org, 'web_bookings', bookingId, tag))
      assert.equal((await db.query('SELECT primary_classification_value_id FROM web_bookings WHERE id=$1', [bookingId])).rows[0].primary_classification_value_id, primary.values[0].id)
    } finally { client.release() }
    const labeled = await addPrimaryClassificationLabels(db, org, [{ primaryClassificationValueId: primary.values[0].id }])
    assert.equal(labeled[0].primaryClassificationName, 'Office')
    await db.query('UPDATE web_master_data SET is_active=false WHERE id=$1', [primary.values[0].id])
    assert.equal((await addPrimaryClassificationLabels(db, org, labeled))[0].primaryClassificationName, 'Office', 'archived names remain visible on historical bookings')
    assert.equal((await addPrimaryClassificationLabels(db, foreign, labeled))[0].primaryClassificationName, null, 'category labels never cross organization boundaries')
    assert.equal((await call('foreign', 'GET', '/settings/profile')).json().profile, 'NONPROFIT')
    assert.equal((await call('foreign', 'GET', '/classifications/primary')).json().values.length, 4)
    assert.equal((await call('admin', 'PATCH', '/settings/profile', { profile: 'NONPROFIT', version: 1 })).statusCode, 409)
    assert.equal((await call('admin', 'GET', '/classifications/primary')).json().values.length, 0)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_type='web_organization_profiles' AND organization_id=$1", [org])).rows[0].n, 0)
  } finally {
    await app.close()
    await db.end()
    await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool.end()
  }
})
