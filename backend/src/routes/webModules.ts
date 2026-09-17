import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { requireRoles } from '../middleware/auth.js'

const keys = ['Dashboard', 'Buchungen', 'Dauerbuchungen', 'Bankimport', 'Belege', 'Mitglieder', 'Budgets', 'Zweckbindungen', 'Reports', 'KI', 'Einreichungen', 'Einstellungen'] as const
const locked = ['Dashboard', 'Buchungen', 'Einreichungen', 'Einstellungen']
const view = (row: { settings_version: number; visible_nav_items: string[] | null }) => ({
  version: row.settings_version,
  visibleNavItems: [...new Set([...(row.visible_nav_items || keys), ...locked])]
})
const webModules: FastifyPluginAsync = async app => {
  app.get('/settings/modules', async request => {
    const row = (await getDatabase().query('SELECT settings_version,visible_nav_items FROM organizations WHERE id=$1', [request.user.organizationId])).rows[0]
    return view(row)
  })
  app.patch('/settings/modules', { preHandler: requireRoles('ADMIN') }, async request => {
    const body = z.object({ version: z.number().int().nonnegative(), visibleNavItems: z.array(z.enum(keys)).max(keys.length) }).strict().parse(request.body)
    const user = request.user, client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const before = (await client.query('SELECT settings_version,visible_nav_items FROM organizations WHERE id=$1 FOR UPDATE', [user.organizationId])).rows[0]
      if (before.settings_version !== body.version) throw Object.assign(new Error('Die Organisation wurde inzwischen geändert. Bitte neu laden.'), { statusCode: 409 })
      const saved = await client.query('UPDATE organizations SET visible_nav_items=$1,settings_version=settings_version+1 WHERE id=$2 RETURNING settings_version,visible_nav_items', [[...new Set([...body.visibleNavItems, ...locked])],user.organizationId])
      const after = view(saved.rows[0])
      await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$1,$5)', [user.organizationId,user.userId,'UPDATE','web_modules',JSON.stringify({before:view(before),after})])
      await client.query('COMMIT')
      return after
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  })
}
export default webModules
