import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { initializeDatabase, getDatabase } from '../src/config/database.js'
import { buildApp } from '../src/server.js'

const enabled = !!process.env.DATABASE_URL && process.env.TEST_DATABASE === '1'
const app = buildApp()
const headers = { 'x-vereino-request': '1' }
let adminCookie = ''
let editorCookie = ''
let editorId: number
before(async () => {
  if (!enabled) return
  process.env.SETUP_TOKEN = 'integration-test-setup-token-123456'
  process.env.COOKIE_SECURE = 'false'
  process.env.APP_ORIGIN = 'https://verein.example'
  await initializeDatabase()
  await getDatabase().query('TRUNCATE organizations CASCADE')
})
after(async () => { await app.close(); if (enabled) await getDatabase().end() })
const cookieOf = (response: any) => String(response.headers['set-cookie']).split(';')[0]
test('auth boundary, setup, roles and revocation', { skip: !enabled }, async () => {
  let response = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: {} })
  assert.equal(response.statusCode, 403)
  response = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: { ...headers, origin: 'https://evil.example' }, payload: {} })
  assert.equal(response.statusCode, 403)
  const setup = { organizationName: 'Testverein', email: 'admin@example.org', password: 'safe-password-admin', setupToken: process.env.SETUP_TOKEN }
  response = await app.inject({ method: 'POST', url: '/api/auth/setup', headers, payload: setup })
  assert.equal(response.statusCode, 201, response.body)
  assert.equal(response.json().user.role, 'ADMIN')
  adminCookie = cookieOf(response)
  assert.match(String(response.headers['set-cookie']), /HttpOnly; SameSite=Strict/)
  response = await app.inject({ method: 'POST', url: '/api/auth/setup', headers, payload: setup })
  assert.equal(response.statusCode, 409)
  response = await app.inject({ method: 'POST', url: '/api/users', headers: { ...headers, cookie: adminCookie }, payload: { email: 'editor@example.org', password: 'safe-password-editor', role: 'EDITOR' } })
  assert.equal(response.statusCode, 201, response.body)
  editorId = response.json().user.id
  response = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { email: 'EDITOR@example.org', password: 'safe-password-editor' } })
  assert.equal(response.statusCode, 200)
  editorCookie = cookieOf(response)
  assert.equal((await app.inject({ url: '/api/users', headers: { cookie: editorCookie } })).statusCode, 403)
  const admin = (await app.inject({ url: '/api/auth/me', headers: { cookie: adminCookie } })).json().user
  response = await app.inject({ method: 'PATCH', url: `/api/users/${admin.id}`, headers: { ...headers, cookie: adminCookie }, payload: { role: 'USER' } })
  assert.equal(response.statusCode, 409)
  response = await app.inject({ method: 'PATCH', url: `/api/users/${editorId}`, headers: { ...headers, cookie: adminCookie }, payload: { role: 'USER' } })
  assert.equal(response.statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie: editorCookie } })).statusCode, 401)
  response = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { email: 'editor@example.org', password: 'safe-password-editor' } })
  assert.equal(response.json().user.role, 'USER')
  editorCookie = cookieOf(response)
  response = await app.inject({ method: 'POST', url: `/api/users/${editorId}/password`, headers: { ...headers, cookie: adminCookie }, payload: { password: 'safe-password-reset' } })
  assert.equal(response.statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie: editorCookie } })).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { email: 'editor@example.org', password: 'safe-password-editor' } })).statusCode, 401)
  response = await app.inject({ method: 'PATCH', url: `/api/users/${editorId}`, headers: { ...headers, cookie: adminCookie }, payload: { isActive: false } })
  assert.equal(response.statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie: editorCookie } })).statusCode, 401)
  response = await app.inject({ method: 'POST', url: '/api/auth/password', headers: { ...headers, cookie: adminCookie }, payload: { currentPassword: 'safe-password-admin', newPassword: 'safe-password-updated' } })
  assert.equal(response.statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie: adminCookie } })).statusCode, 401)
  assert.equal((await app.inject({ url: '/api/vouchers' })).statusCode, 404)
  const audits = (await getDatabase().query("SELECT action,changes FROM audit_log WHERE entity_type='users' ORDER BY id")).rows
  assert.deepEqual(audits.map(row => row.action), ['SETUP', 'CREATE', 'UPDATE', 'PASSWORD_RESET', 'UPDATE', 'PASSWORD_CHANGE'])
  assert.equal(audits[2].changes.before.role, 'EDITOR')
  assert.equal(audits[2].changes.after.role, 'USER')
  assert.equal(audits[4].changes.after.isActive, false)
  assert.deepEqual(audits[3].changes, {})
  assert.deepEqual(audits[5].changes, {})
  const serialized = JSON.stringify(audits.map(row => row.changes))
  for (const secret of ['safe-password', 'password_hash', 'token', '$2b$']) assert.ok(!serialized.includes(secret))
})
