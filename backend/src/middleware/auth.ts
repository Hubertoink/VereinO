import { createHash } from 'node:crypto'
import { FastifyRequest, FastifyReply } from 'fastify'
import { getDatabase } from '../config/database.js'

export type Role = 'ADMIN' | 'EDITOR' | 'USER'
export interface SessionUser {
  userId: number
  organizationId: number
  email: string
  role: Role
}
export type AuthenticatedRequest = FastifyRequest
export const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex')
export function sessionToken(request: FastifyRequest): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('vereino_session='))
    ?.slice(16)
}
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const token = sessionToken(request)
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return reply.code(401).send({ error: 'Bitte anmelden.' })
  const result = await getDatabase().query(
    `SELECT u.id, u.email, m.role, m.organization_id FROM sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=COALESCE(s.organization_id,u.organization_id) WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=true AND m.is_active=true`,
    [sessionHash(token)]
  )
  const row = result.rows[0]
  if (!row) return reply.code(401).send({ error: 'Sitzung abgelaufen. Bitte anmelden.' })
  const expectedOrganization = request.headers['x-vereino-organization']
  if (expectedOrganization !== undefined && expectedOrganization !== String(row.organization_id))
    return reply.code(409).send({ error: 'Die aktive Organisation wurde in einem anderen Tab gewechselt. Bitte diese Seite neu laden.', code: 'ORGANIZATION_CHANGED' })
  request.user = {
    userId: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role
  }
}
export function requireRoles(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (reply.sent) return
    if (!roles.includes(request.user.role))
      return reply.code(403).send({ error: 'Keine Berechtigung.' })
  }
}
/** Custom header prevents browser form CSRF; Origin is checked against the configured public URL. */
export async function protectMutation(request: FastifyRequest, reply: FastifyReply) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  if (request.headers['x-vereino-request'] !== '1')
    return reply.code(403).send({ error: 'Request header required.' })
  const origin = request.headers.origin
  const expected = process.env.APP_ORIGIN
  if (origin && (!expected || origin !== expected))
    return reply.code(403).send({ error: 'Origin not allowed.' })
}
