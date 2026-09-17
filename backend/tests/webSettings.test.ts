import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import Fastify from 'fastify'
import { Pool } from 'pg'
import { initializeDatabase } from '../src/config/database.js'
import { authenticate, sessionHash } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/error.js'
import webSettingsRoutes, { webPreferencesSchema, webTableSchema, webWorkflowSchema } from '../src/routes/webSettings.js'

const defaults = {
  version: 0,
  themeMode: 'dark',
  colorTheme: 'default',
  navLayout: 'left',
  navIconColorMode: 'color'
}
test('preferences accept only supported values and cannot select another account', () => {
  assert(webPreferencesSchema.safeParse(defaults).success)
  for (const change of [
    { userId: 7 },
    { organizationId: 7 },
    { navLayout: 'random' },
    { colorTheme: 'invalid' },
    { version: -1 }
  ])
    assert(!webPreferencesSchema.safeParse({ ...defaults, ...change }).success)
})
test('workflow and table settings accept only browser-safe values', () => {
  assert(webWorkflowSchema.safeParse({ version: 0, bookingView: 'plus', showBookingDraftTabs: false, showBookingEditTabs: false, bookingEntryPresentation: 'flyout', allowVoucherDeletion: false, quickAddAfterSave: 'close' }).success)
  assert(!webWorkflowSchema.safeParse({ version: 0, bookingView: 'desktop-window', showBookingDraftTabs: false, showBookingEditTabs: false, bookingEntryPresentation: 'flyout', allowVoucherDeletion: false, quickAddAfterSave: 'close' }).success)
  const table = { version: 0, dateFormat: 'de', journalRowStyle: 'both', journalRowDensity: 'normal', journalLimit: 50, columns: { actions: true, date: true, voucherNo: false, type: true, sphere: true, description: true, note: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: false, vat: false, gross: true }, columnOrder: ['actions', 'date', 'type'] }
  assert(webTableSchema.safeParse(table).success)
  assert(!webTableSchema.safeParse({ ...table, journalLimit: 25 }).success)
})
test(
  'PostgreSQL settings: tenant identity, own preferences, roles and concurrent edits',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
    const schema = `settings_test_${randomBytes(8).toString('hex')}`
    await adminPool.query(`CREATE SCHEMA ${schema}`)
    const url = new URL(process.env.TEST_DATABASE_URL!)
    url.searchParams.set('options', `-c search_path=${schema}`)
    process.env.DATABASE_URL = url.toString()
    const db = await initializeDatabase(),
      app = Fastify()
    try {
      for (const file of ['001_initial_schema.sql', '002_auth.sql','016_web_organization_memberships.sql', '008_web_settings.sql', '010_web_master_data.sql', '011_web_extended_settings.sql'])
        await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
      const org = (
        await db.query("INSERT INTO organizations(name) VALUES('Originalverein') RETURNING id")
      ).rows[0].id
      const foreign = (
        await db.query("INSERT INTO organizations(name) VALUES('Anderer Verein') RETURNING id")
      ).rows[0].id
      const tokens: Record<string, string> = {},
        users: Record<string, number> = {}
      for (const [name, role, tenant] of [
        ['admin', 'ADMIN', org],
        ['editor', 'EDITOR', org],
        ['user', 'USER', org],
        ['foreign', 'ADMIN', foreign]
      ]) {
        users[name] = (
          await db.query(
            'INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',
            [tenant, `${name}@settings.invalid`, 'unused', role]
          )
        ).rows[0].id
        tokens[name] = randomBytes(32).toString('hex')
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",
          [sessionHash(tokens[name]), users[name]]
        )
      }
      app.decorate('authenticate', authenticate)
      app.setErrorHandler(errorHandler)
      await app.register(webSettingsRoutes, { prefix: '/api' })
      const call = (who: string, method: 'GET' | 'PATCH', path: string, payload?: object) =>
        app.inject({
          method,
          url: `/api/settings/${path}`,
          headers: { cookie: `vereino_session=${tokens[who]}` },
          ...(payload ? { payload } : {})
        })
      assert.equal((await app.inject('/api/settings/preferences')).statusCode, 401)
      assert.equal((await call('user', 'GET', 'organization')).statusCode, 403)
      assert.equal(
        (await call('editor', 'GET', 'organization')).json().organization.name,
        'Originalverein'
      )
      assert.equal(
        (await call('editor', 'PATCH', 'organization', { name: 'Denied', version: 1 })).statusCode,
        403
      )
      const changed = await call('admin', 'PATCH', 'organization', {
        name: ' Neuer Name ',
        version: 1
      })
      assert.equal(changed.statusCode, 200, changed.body)
      assert.deepEqual(changed.json().organization, { name: 'Neuer Name', version: 2, address: '', cashier: '', logoDataUrl: null, taxCertificate: null })
      assert.equal(
        (await call('admin', 'PATCH', 'organization', { name: 'Stale', version: 1 })).statusCode,
        409
      )
      assert.equal(
        (await call('foreign', 'GET', 'organization')).json().organization.name,
        'Anderer Verein'
      )
      assert.equal(
        (
          await call('foreign', 'PATCH', 'organization', {
            name: 'Attack',
            version: 2,
            organizationId: org
          })
        ).statusCode,
        400
      )
      assert.equal(
        (await call('admin', 'GET', 'organization')).json().organization.name,
        'Neuer Name'
      )
      assert.equal(
        (
          await db.query(
            'SELECT COUNT(*)::int AS count FROM audit_log WHERE entity_type=$1 AND organization_id=$2',
            ['organizations', org]
          )
        ).rows[0].count,
        1
      )
      assert.deepEqual((await call('user', 'GET', 'preferences')).json().preferences, defaults)
      const attempts = await Promise.all([
        call('user', 'PATCH', 'preferences', { ...defaults, themeMode: 'light' }),
        call('user', 'PATCH', 'preferences', { ...defaults, navLayout: 'top' })
      ])
      assert.deepEqual(attempts.map((result) => result.statusCode).sort(), [200, 409])
      const current = (await call('user', 'GET', 'preferences')).json().preferences
      assert.equal(current.version, 1)
      const final = {
        ...current,
        colorTheme: 'ocean-breeze',
        navIconColorMode: 'mono',
        navLayout: 'top'
      }
      assert.equal((await call('user', 'PATCH', 'preferences', final)).statusCode, 200)
      const persisted = (await call('user', 'GET', 'preferences')).json().preferences
      assert.deepEqual(persisted, { ...final, version: 2 })
      assert.deepEqual((await call('admin', 'GET', 'preferences')).json().preferences, defaults)
      assert.equal(
        (await call('user', 'PATCH', 'preferences', { ...persisted, userId: users.admin }))
          .statusCode,
        400
      )
      assert.equal(
        (await db.query('SELECT user_id FROM web_user_preferences')).rows[0].user_id,
        users.user
      )
    } finally {
      await app.close()
      await db.end()
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`)
      await adminPool.end()
    }
  }
)
