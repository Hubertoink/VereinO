import { randomBytes, timingSafeEqual } from 'node:crypto'
import { FastifyPluginAsync, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { PoolClient } from 'pg'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { authenticate, requireRoles, sessionHash, sessionToken } from '../middleware/auth.js'

const email = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((s) => s.toLowerCase())
const password = z
  .string()
  .min(12)
  .max(72)
  .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'Password exceeds 72 bytes')
const credentials = z.object({ email, password: z.string().min(1).max(72) })
const role = z.enum(['ADMIN', 'EDITOR', 'USER'])
const userView = (row: any) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  organizationId: row.organization_id,
  organizationName: row.organization_name,
  isActive: row.is_active
})
const cookie = (token: string, maxAge: number) =>
  `vereino_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.COOKIE_SECURE === 'false' ? '' : '; Secure'}`
export async function createSession(
  client: PoolClient,
  userId: number,
  reply: FastifyReply,
  organizationId: number
) {
  const token = randomBytes(32).toString('hex')
  await client.query(
    "INSERT INTO sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '12 hours')",
    [sessionHash(token), userId, organizationId]
  )
  reply.header('set-cookie', cookie(token, 43200))
}
async function audit(
  client: PoolClient,
  organizationId: number,
  actorId: number,
  action: string,
  id: number,
  changes: unknown
) {
  await client.query(
    'INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',
    [organizationId, actorId, action, 'users', id, JSON.stringify(changes)]
  )
}
function validSetupToken(value: string) {
  const expected = process.env.SETUP_TOKEN
  return (
    !!expected &&
    expected.length >= 24 &&
    Buffer.byteLength(expected) === Buffer.byteLength(value) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(value))
  )
}
const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/status', async () => ({
    setupRequired: !(await getDatabase().query('SELECT 1 FROM users LIMIT 1')).rowCount
  }))
  app.post('/auth/setup', async (request, reply) => {
    const body = z
      .object({
        organizationName: z.string().trim().min(2).max(255),
        profile: z.enum(['NONPROFIT', 'GENERAL']).default('NONPROFIT'),
        email,
        password,
        setupToken: z.string().max(1024)
      })
      .parse(request.body)
    if (!validSetupToken(body.setupToken))
      return reply.code(403).send({ error: 'Ungültiger Einrichtungsschlüssel.' })
    const hash = await bcrypt.hash(body.password, 12)
    const client = await getDatabase().connect()
    let user: any
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(397001)')
      if ((await client.query('SELECT 1 FROM users LIMIT 1')).rowCount) {
        await client.query('ROLLBACK')
        return reply.code(409).send({ error: 'Einrichtung bereits abgeschlossen.' })
      }
      const org = await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id', [
        body.organizationName
      ])
      await client.query(
        'INSERT INTO web_organization_profiles(organization_id,profile) VALUES($1,$2)',
        [org.rows[0].id, body.profile]
      )
      user = (
        await client.query(
          "INSERT INTO users(email,password_hash,organization_id,role) VALUES($1,$2,$3,'ADMIN') RETURNING *",
          [body.email, hash, org.rows[0].id]
        )
      ).rows[0]
      await audit(client, user.organization_id, user.id, 'SETUP', user.id, {
        after: { ...userView(user), profile: body.profile }
      })
      await createSession(client, user.id, reply, user.organization_id)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    return reply
      .code(201)
      .send({ user: userView({ ...user, organization_name: body.organizationName }) })
  })
  app.post('/auth/login', async (request, reply) => {
    const body = credentials.parse(request.body)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      // Serialize password verification/session creation with password reset and deactivation.
      const row = (
        await client.query(
          'SELECT u.*, m.organization_id, m.role, o.name AS organization_name FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.is_active=true JOIN organizations o ON o.id=m.organization_id WHERE LOWER(u.email)=$1 AND u.is_active=true ORDER BY (m.organization_id=u.organization_id) DESC,m.organization_id LIMIT 1 FOR UPDATE OF u',
          [body.email]
        )
      ).rows[0]
      const hash =
        row?.password_hash ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW'
      const valid = await bcrypt.compare(body.password, hash)
      if (!row || !valid) {
        await client.query('ROLLBACK')
        return reply.code(401).send({ error: 'E-Mail oder Passwort ungültig.' })
      }
      await createSession(client, row.id, reply, row.organization_id)
      await client.query('COMMIT')
      return { user: userView(row) }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
  app.get('/auth/me', { preHandler: authenticate }, async (request) => {
    const organization = await getDatabase().query('SELECT name FROM organizations WHERE id=$1', [
      request.user.organizationId
    ])
    return {
      user: {
        id: request.user.userId,
        email: request.user.email,
        role: request.user.role,
        organizationId: request.user.organizationId,
        organizationName: organization.rows[0]?.name
      }
    }
  })
  app.post('/auth/logout', async (request, reply) => {
    const token = sessionToken(request)
    if (token)
      await getDatabase().query('DELETE FROM sessions WHERE token_hash=$1', [sessionHash(token)])
    reply.header('set-cookie', cookie('', 0))
    return { ok: true }
  })
  app.post('/auth/password', { preHandler: authenticate }, async (request, reply) => {
    const body = z
      .object({ currentPassword: z.string().max(72), newPassword: password })
      .parse(request.body)
    const hash = await bcrypt.hash(body.newPassword, 12)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const row = (
        await client.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE', [
          request.user.userId
        ])
      ).rows[0]
      if (!(await bcrypt.compare(body.currentPassword, row.password_hash))) {
        await client.query('ROLLBACK')
        return reply.code(403).send({ error: 'Aktuelles Passwort ungültig.' })
      }
      await client.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2', [
        hash,
        request.user.userId
      ])
      await client.query('DELETE FROM sessions WHERE user_id=$1', [request.user.userId])
      await audit(
        client,
        request.user.organizationId,
        request.user.userId,
        'PASSWORD_CHANGE',
        request.user.userId,
        {}
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    reply.header('set-cookie', cookie('', 0))
    return { ok: true }
  })
  app.get('/users', { preHandler: requireRoles('ADMIN') }, async (request) => ({
    users: (
      await getDatabase().query(
        'SELECT u.*,m.organization_id,m.role,m.is_active FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.email',
        [request.user.organizationId]
      )
    ).rows.map(userView)
  }))
  app.post('/users', { preHandler: requireRoles('ADMIN') }, async (request, reply) => {
    const body = z.object({ email, password, role }).parse(request.body)
    const hash = await bcrypt.hash(body.password, 12)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const row = (
        await client.query(
          'INSERT INTO users(email,password_hash,organization_id,role) VALUES($1,$2,$3,$4) RETURNING *',
          [body.email, hash, request.user.organizationId, body.role]
        )
      ).rows[0]
      await audit(client, request.user.organizationId, request.user.userId, 'CREATE', row.id, {
        after: userView(row)
      })
      await client.query('COMMIT')
      return reply.code(201).send({ user: userView(row) })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
  app.patch('/users/:id', { preHandler: requireRoles('ADMIN') }, async (request, reply) => {
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((request.params as any).id)
    const body = z
      .object({ role: role.optional(), isActive: z.boolean().optional() })
      .refine((b) => b.role !== undefined || b.isActive !== undefined)
      .parse(request.body)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [
        request.user.organizationId
      ])
      const row = (
        await client.query(
          'SELECT u.*,m.organization_id,m.role,m.is_active FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 FOR UPDATE OF m',
          [id, request.user.organizationId]
        )
      ).rows[0]
      if (!row) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: 'Benutzer nicht gefunden.' })
      }
      if (
        row.role === 'ADMIN' &&
        row.is_active &&
        ((body.role && body.role !== 'ADMIN') || body.isActive === false)
      ) {
        const count = (
          await client.query(
            "SELECT COUNT(*)::int AS count FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role='ADMIN' AND m.is_active AND u.is_active",
            [request.user.organizationId]
          )
        ).rows[0].count
        if (count <= 1) {
          await client.query('ROLLBACK')
          return reply.code(409).send({ error: 'Mindestens ein aktiver Admin ist erforderlich.' })
        }
      }
      const updated = (
        await client.query(
          'UPDATE organization_memberships SET role=$1,is_active=$2 WHERE user_id=$3 AND organization_id=$4 RETURNING user_id AS id,organization_id,role,is_active',
          [body.role ?? row.role, body.isActive ?? row.is_active, id, request.user.organizationId]
        )
      ).rows[0]
      await client.query('DELETE FROM sessions WHERE user_id=$1 AND organization_id=$2', [
        id,
        request.user.organizationId
      ])
      await audit(client, request.user.organizationId, request.user.userId, 'UPDATE', id, {
        before: userView(row),
        after: userView(updated)
      })
      await client.query('COMMIT')
      return { user: userView({ ...updated, email: row.email }) }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
  app.post('/users/:id/password', { preHandler: requireRoles('ADMIN') }, async (request, reply) => {
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((request.params as any).id)
    const body = z.object({ password }).parse(request.body)
    const hash = await bcrypt.hash(body.password, 12)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const memberships = await client.query(
        'SELECT organization_id FROM organization_memberships WHERE user_id=$1 FOR UPDATE',
        [id]
      )
      if (!memberships.rows.some((row) => row.organization_id === request.user.organizationId)) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: 'Benutzer nicht gefunden.' })
      }
      if (memberships.rows.some((row) => row.organization_id !== request.user.organizationId)) {
        await client.query('ROLLBACK')
        return reply
          .code(409)
          .send({
            error:
              'Dieses Konto hat Zugang zu mehreren Organisationen. Das Passwort muss die Person unter Mein Konto selbst ändern.'
          })
      }
      const result = await client.query(
        'UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3 RETURNING id',
        [hash, id, request.user.organizationId]
      )
      if (!result.rowCount) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: 'Benutzer nicht gefunden.' })
      }
      await client.query('DELETE FROM sessions WHERE user_id=$1', [id])
      await audit(
        client,
        request.user.organizationId,
        request.user.userId,
        'PASSWORD_RESET',
        id,
        {}
      )
      await client.query('COMMIT')
      return { ok: true }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
}
export default authRoutes
