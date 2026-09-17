import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../config/database.js'
import { requireRoles } from '../middleware/auth.js'

export const profilePatchSchema = z.object({
  version: z.number().int().nonnegative(),
  profile: z.enum(['NONPROFIT', 'GENERAL'])
}).strict()

const definitions = {
  NONPROFIT: { profile: 'NONPROFIT', primarySchemeKey: 'nonprofit-spheres', primaryLabel: 'Sphäre', primaryLabelPlural: 'Sphären', supportsTaxSpheres: true, supportsDonationReceipts: true, supportsNonprofitFiscalReport: true },
  GENERAL: { profile: 'GENERAL', primarySchemeKey: 'general-categories', primaryLabel: 'Kategorie', primaryLabelPlural: 'Kategorien', supportsTaxSpheres: false, supportsDonationReceipts: false, supportsNonprofitFiscalReport: false }
} as const
type Profile = keyof typeof definitions
const spheres = [
  { id: 1, stableKey: 'IDEELL', name: 'Ideeller Bereich' },
  { id: 2, stableKey: 'ZWECK', name: 'Zweckbetrieb' },
  { id: 3, stableKey: 'VERMOEGEN', name: 'Vermögensverwaltung' },
  { id: 4, stableKey: 'WGB', name: 'Wirtschaftlicher Geschäftsbetrieb' }
]

const webProfiles: FastifyPluginAsync = async app => {
  app.get('/settings/profile', { onRequest: app.authenticate }, async request => {
    const result = await getDatabase().query('SELECT profile, version FROM web_organization_profiles WHERE organization_id=$1', [request.user.organizationId])
    const profile: Profile = result.rows[0]?.profile || 'NONPROFIT'
    return { profile, version: result.rows[0]?.version || 0, definition: definitions[profile] }
  })
  app.get('/classifications/primary', { onRequest: app.authenticate }, async request => {
    const result = await getDatabase().query('SELECT profile FROM web_organization_profiles WHERE organization_id=$1', [request.user.organizationId])
    const profile: Profile = result.rows[0]?.profile || 'NONPROFIT'
    const values = profile === 'NONPROFIT' ? spheres.map(sphere => ({ ...sphere, isActive: true, isSystem: true })) :
      (await getDatabase().query("SELECT id, name, is_active AS \"isActive\", data->>'color' AS color, data->>'icon' AS icon FROM web_master_data WHERE organization_id=$1 AND kind='categories' AND is_active=true ORDER BY lower(name), id", [request.user.organizationId])).rows
    return { profile, definition: definitions[profile], values }
  })
  app.patch('/settings/profile', { onRequest: requireRoles('ADMIN') }, async request => {
    profilePatchSchema.parse(request.body)
    throw Object.assign(new Error('Die Organisationsart wird bei der Erstellung festgelegt und kann danach nicht geändert werden.'), { statusCode: 409 })
  })
}
export default webProfiles
