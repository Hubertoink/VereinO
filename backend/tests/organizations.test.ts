import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'
import { initializeDatabase } from '../src/config/database.js'
import { buildApp } from '../src/server.js'
import { sessionHash } from '../src/middleware/auth.js'

test(
  'organizations: migration, fixed type, memberships, roles, switching, stale tabs and isolated data',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL }),
      schema = `orgs_${randomBytes(8).toString('hex')}`
    await pool.query(`CREATE SCHEMA ${schema}`)
    const url = new URL(process.env.TEST_DATABASE_URL!)
    url.searchParams.set('options', `-c search_path=${schema}`)
    process.env.DATABASE_URL = url.toString()
    const db = await initializeDatabase(),
      app = buildApp()
    try {
      const dir = new URL('../migrations/', import.meta.url),
        files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
      for (const file of files.filter((file) => file < '016'))
        await db.query(await readFile(new URL(file, dir), 'utf8'))
      const original = (
        await db.query("INSERT INTO organizations(name) VALUES('Original') RETURNING id")
      ).rows[0].id
      const foreign = (
        await db.query("INSERT INTO organizations(name) VALUES('Foreign') RETURNING id")
      ).rows[0].id
      const cookies: Record<string, string> = { reactivated: '' },
        ids: Record<string, number> = {}
      const hash = await bcrypt.hash('test-password-12345', 4)
      for (const [name, role, org] of [
        ['admin', 'ADMIN', original],
        ['editor', 'EDITOR', original],
        ['user', 'USER', original],
        ['foreign', 'ADMIN', foreign]
      ] as const) {
        ids[name] = (
          await db.query(
            'INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',
            [org, `${name}@org.test`, hash, role]
          )
        ).rows[0].id
        const token = randomBytes(32).toString('hex')
        cookies[name] = `vereino_session=${token}`
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [sessionHash(token), ids[name]]
        )
      }
      const inactive = (
        await db.query(
          "INSERT INTO users(organization_id,email,password_hash,role,is_active) VALUES($1,'inactive@org.test',$2,'USER',false) RETURNING id",
          [original, hash]
        )
      ).rows[0].id
      for (const file of files.filter((file) => file >= '016'))
        await db.query(await readFile(new URL(file, dir), 'utf8'))
      const call = async (
        who: string,
        method: 'GET' | 'POST' | 'PATCH',
        path: string,
        payload?: object,
        organizationId?: number
      ) => {
        const response = await app.inject({
          method,
          url: '/api' + path,
          headers: {
            cookie: cookies[who],
            'x-vereino-request': '1',
            ...(organizationId ? { 'x-vereino-organization': String(organizationId) } : {})
          },
          ...(payload ? { payload } : {})
        })
        const cookie = response.headers['set-cookie']
        if (cookie) cookies[who] = String(cookie).split(';')[0]
        return response
      }
      assert.equal(
        (
          await call('user', 'POST', '/auth/login', {
            email: 'inactive@org.test',
            password: 'test-password-12345'
          })
        ).statusCode,
        401
      )
      assert.equal(
        (await call('admin', 'PATCH', `/users/${inactive}`, { isActive: true })).statusCode,
        200
      )
      const reactivated = await call('reactivated', 'POST', '/auth/login', {
        email: 'inactive@org.test',
        password: 'test-password-12345'
      })
      assert.equal(reactivated.statusCode, 200)
      assert.equal((await call('admin', 'GET', '/auth/me')).json().user.organizationId, original)
      assert.equal((await call('admin', 'GET', '/organizations')).json().organizations.length, 1)
      assert.equal(
        (await call('admin', 'PATCH', '/settings/profile', { profile: 'GENERAL', version: 1 }))
          .statusCode,
        409
      )
      await assert.rejects(
        db.query(
          "UPDATE web_organization_profiles SET profile='GENERAL' WHERE organization_id=$1",
          [original]
        )
      )
      for (const who of ['user', 'editor'])
        assert.equal(
          (await call(who, 'POST', '/organizations', { name: 'Denied', profile: 'GENERAL' }))
            .statusCode,
          403
        )
      assert.equal(
        (
          await call('admin', 'POST', '/organizations', {
            name: 'Denied foreign',
            profile: 'GENERAL',
            members: [{ userId: ids.foreign, role: 'ADMIN' }]
          })
        ).statusCode,
        400
      )
      assert.equal(Number((await db.query('SELECT count(*) FROM organizations')).rows[0].count), 2)
      const created = await call('admin', 'POST', '/organizations', {
        name: 'Household',
        profile: 'GENERAL',
        members: [{ userId: ids.editor, role: 'USER' }]
      })
      assert.equal(created.statusCode, 201, created.body)
      const target = created.json().organization.id
      assert.equal((await call('user', 'POST', `/organizations/${target}/switch`)).statusCode, 403)
      assert.equal(
        (await call('foreign', 'POST', `/organizations/${target}/switch`)).statusCode,
        403
      )
      assert.equal((await call('editor', 'GET', '/organizations')).json().organizations.length, 2)
      const booking = {
        type: 'IN',
        date: '2026-09-16',
        description: 'Original only',
        grossAmountCents: 1234,
        sphere: 'IDEELL',
        paymentMethod: 'BANK'
      }
      assert.equal((await call('admin', 'POST', '/bookings', booking)).statusCode, 201)
      const oldCookie = cookies.admin
      assert.equal(
        (await call('admin', 'POST', `/organizations/${target}/switch`, {}, original)).statusCode,
        200
      )
      assert.notEqual(cookies.admin, oldCookie)
      assert.equal(
        (await app.inject({ url: '/api/auth/me', headers: { cookie: oldCookie } })).statusCode,
        401
      )
      assert.equal((await call('admin', 'GET', '/settings/profile')).json().profile, 'GENERAL')
      assert.deepEqual((await call('admin', 'GET', '/bookings')).json().bookings, [])
      assert.equal(
        (await call('admin', 'POST', '/bookings', booking, original)).statusCode,
        409,
        'stale tab cannot write into newly selected organization'
      )
      assert.equal((await call('admin', 'GET', '/bookings', undefined, original)).statusCode, 409)
      assert.equal((await call('admin', 'GET', '/users')).json().users.length, 2)
      assert.equal(
        (await call('admin', 'PATCH', `/users/${ids.admin}`, { role: 'USER' })).statusCode,
        409,
        'last admin remains'
      )
      assert.equal(
        (
          await call('admin', 'POST', `/users/${ids.editor}/password`, {
            password: 'changed-password-123'
          })
        ).statusCode,
        409,
        'shared account cannot be taken over via password reset'
      )
      assert.equal(
        (await call('editor', 'POST', `/organizations/${target}/switch`)).json().user.role,
        'USER'
      )
      assert.equal((await call('editor', 'GET', '/bookings')).statusCode, 403)
      assert.equal((await call('editor', 'POST', '/drafts', booking)).statusCode, 201)
      assert.equal(
        (await call('admin', 'PATCH', `/users/${ids.editor}`, { isActive: false })).statusCode,
        200
      )
      assert.equal((await call('editor', 'GET', '/auth/me')).statusCode, 401)
      const login = await call('editor', 'POST', '/auth/login', {
        email: 'editor@org.test',
        password: 'test-password-12345'
      })
      assert.equal(login.statusCode, 200)
      assert.equal(login.json().user.organizationId, original)
      assert.equal(login.json().user.role, 'EDITOR')
      assert.equal((await call('editor', 'GET', '/bookings')).json().bookings.length, 1)
      assert.equal((await call('editor', 'GET', '/drafts')).json().drafts.length, 0)
      assert.equal((await call('admin', 'GET', '/drafts')).json().drafts.length, 1)
    } finally {
      await app.close()
      await db.end()
      await pool.query(`DROP SCHEMA ${schema} CASCADE`)
      await pool.end()
    }
  }
)
