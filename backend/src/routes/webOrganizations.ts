import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { requireRoles, sessionHash, sessionToken } from '../middleware/auth.js'
import { createSession } from './auth.js'
const creation = z
  .object({
    name: z.string().trim().min(2).max(255),
    profile: z.enum(['NONPROFIT', 'GENERAL']),
    members: z
      .array(
        z
          .object({
            userId: z.number().int().positive(),
            role: z.enum(['ADMIN', 'EDITOR', 'USER'])
          })
          .strict()
      )
      .max(500)
      .default([])
  })
  .strict()
  .refine(
    (input) => new Set(input.members.map((member) => member.userId)).size === input.members.length,
    'Benutzer dürfen nur einmal ausgewählt werden.'
  )
const webOrganizations: FastifyPluginAsync = async (app) => {
  app.get('/organizations', { onRequest: app.authenticate }, async (request) => ({
    organizations: (
      await getDatabase().query(
        `SELECT o.id,o.name,m.role,p.profile FROM organization_memberships m
   JOIN organizations o ON o.id=m.organization_id JOIN web_organization_profiles p ON p.organization_id=o.id
   WHERE m.user_id=$1 AND m.is_active ORDER BY lower(o.name),o.id`,
        [request.user.userId]
      )
    ).rows,
    activeOrganizationId: request.user.organizationId
  }))
  app.post('/organizations', { onRequest: requireRoles('ADMIN') }, async (request, reply) => {
    const body = creation.parse(request.body),
      actor = request.user
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      // Serialize with membership edits and recheck privileges after taking the lock.
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [
        actor.organizationId
      ])
      const membership = (
        await client.query(
          'SELECT role,is_active FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',
          [actor.organizationId, actor.userId]
        )
      ).rows[0]
      if (!membership?.is_active || membership.role !== 'ADMIN')
        throw Object.assign(new Error('Keine Berechtigung.'), { statusCode: 403 })
      const members = body.members.filter((member) => member.userId !== actor.userId)
      const allowed = (
        await client.query(
          `SELECT m.user_id FROM organization_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=$1 AND m.is_active AND u.is_active AND m.user_id=ANY($2::integer[]) FOR SHARE OF m,u`,
          [actor.organizationId, members.map((member) => member.userId)]
        )
      ).rows
      if (allowed.length !== members.length)
        throw Object.assign(
          new Error('Es können nur aktive Benutzer der aktuellen Organisation übernommen werden.'),
          { statusCode: 400 }
        )
      const organization = (
        await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id,name', [
          body.name
        ])
      ).rows[0]
      await client.query(
        'INSERT INTO web_organization_profiles(organization_id,profile) VALUES($1,$2)',
        [organization.id, body.profile]
      )
      await client.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",
        [organization.id, actor.userId]
      )
      for (const member of members)
        await client.query(
          'INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3)',
          [organization.id, member.userId, member.role]
        )
      await client.query(
        `INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,'CREATE','organizations',$1,$3)`,
        [
          organization.id,
          actor.userId,
          JSON.stringify({
            name: body.name,
            profile: body.profile,
            members: [{ userId: actor.userId, role: 'ADMIN' }, ...members]
          })
        ]
      )
      await client.query('COMMIT')
      return reply
        .code(201)
        .send({ organization: { ...organization, profile: body.profile, role: 'ADMIN' } })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
  app.post('/organizations/:id/switch', { onRequest: app.authenticate }, async (request, reply) => {
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((request.params as { id: string }).id)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const membership = (
        await client.query(
          `SELECT m.role,o.name FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
    WHERE m.organization_id=$1 AND m.user_id=$2 AND m.is_active FOR SHARE OF m`,
          [id, request.user.userId]
        )
      ).rows[0]
      if (!membership)
        throw Object.assign(new Error('Keine Berechtigung für diese Organisation.'), {
          statusCode: 403
        })
      const removed = await client.query(
        'DELETE FROM sessions WHERE token_hash=$1 RETURNING user_id',
        [sessionHash(sessionToken(request)!)]
      )
      if (!removed.rowCount)
        throw Object.assign(new Error('Sitzung wurde inzwischen geändert. Bitte neu anmelden.'), {
          statusCode: 401
        })
      await createSession(client, request.user.userId, reply, id)
      await client.query('COMMIT')
      return {
        user: {
          id: request.user.userId,
          email: request.user.email,
          role: membership.role,
          organizationId: id,
          organizationName: membership.name
        }
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
}
export default webOrganizations
