import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import webModules from './webModules.js'
import webMasterDataRoutes from './webMasterData.js'
import {organizationPatchSchema,normalizeOrganizationPatch,organizationView,organizationAudit} from '../services/organizationSettings.js'
import { getDatabase } from '../config/database.js'
import { type AuthenticatedRequest, requireRoles } from '../middleware/auth.js'

export const webPreferencesSchema = z
  .object({
    version: z.number().int().nonnegative(),
    themeMode: z.enum(['dark', 'light']),
    colorTheme: z.enum([
      'default',
      'fiery-ocean',
      'peachy-delight',
      'pastel-dreamland',
      'ocean-breeze',
      'earthy-tones',
      'monochrome-harmony',
      'vintage-charm',
      'soft-blush',
      'professional-light'
    ]),
    navLayout: z.enum(['left', 'top']),
    navIconColorMode: z.enum(['color', 'mono'])
  })
  .strict()
const fail = (statusCode: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode })
}
const preferencesView = (row?: Record<string, any>) =>
  row
    ? {
        version: row.version,
        themeMode: row.theme_mode,
        colorTheme: row.color_theme,
        navLayout: row.nav_layout,
        navIconColorMode: row.nav_icon_color_mode
      }
    : {
        version: 0,
        themeMode: 'dark',
        colorTheme: 'default',
        navLayout: 'left',
        navIconColorMode: 'color'
      }

const workflowDefaults = {
  bookingView: 'plus' as const,
  showBookingDraftTabs: false,
  showBookingEditTabs: false,
  bookingEntryPresentation: 'flyout' as const,
  allowVoucherDeletion: false,
  quickAddAfterSave: 'close' as const
}
const tableDefaults = {
  dateFormat: 'de' as const,
  journalRowStyle: 'both' as const,
  journalRowDensity: 'normal' as const,
  journalLimit: 50,
  columns: {
    actions: true, date: true, voucherNo: false, type: true, sphere: true,
    description: true, note: true, earmark: true, budget: true,
    paymentMethod: true, attachments: true, net: false, vat: false, gross: true
  },
  columnOrder: ['actions', 'date', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'gross', 'voucherNo', 'net', 'vat']
}
export const webWorkflowSchema = z.object({
  version: z.number().int().nonnegative(),
  bookingView: z.enum(['classic', 'plus']),
  showBookingDraftTabs: z.boolean(),
  showBookingEditTabs: z.boolean(),
  bookingEntryPresentation: z.enum(['modal', 'flyout', 'detached']),
  allowVoucherDeletion: z.boolean(),
  quickAddAfterSave: z.enum(['close', 'new'])
}).strict()
const columnKeys = ['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross'] as const
export const webTableSchema = z.object({
  version: z.number().int().nonnegative(),
  dateFormat: z.enum(['de', 'iso']),
  journalRowStyle: z.enum(['both', 'lines', 'zebra', 'none']),
  journalRowDensity: z.enum(['normal', 'compact']),
  journalLimit: z.union([z.literal(20), z.literal(50), z.literal(100)]),
  columns: z.record(z.enum(columnKeys), z.boolean()),
  columnOrder: z.array(z.enum(columnKeys)).max(columnKeys.length)
}).strict()
const extendedView = (row: Record<string, any> | undefined, key: 'workflow' | 'table') => {
  const version = row?.version ?? 0
  const settings = key === 'workflow'
    ? { version, ...workflowDefaults, ...(row?.workflow_data || {}) }
    : { version, ...tableDefaults, ...(row?.table_data || {}), columns: { ...tableDefaults.columns, ...(row?.table_data?.columns || {}) } }
  return { version, settings }
}

const webSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)
  await app.register(webMasterDataRoutes)
  await app.register(webModules)
  app.get(
    '/settings/organization',
    { preHandler: requireRoles('ADMIN', 'EDITOR') },
    async (request) => {
      const user = (request as AuthenticatedRequest).user
      const result = await getDatabase().query(
        'SELECT name, settings_version, settings_data FROM organizations WHERE id=$1',
        [user.organizationId]
      )
      if (!result.rows[0]) fail(404, 'Organisation nicht gefunden.')
      return { organization: organizationView(result.rows[0]) }
    }
  )
  app.patch('/settings/organization', { preHandler: requireRoles('ADMIN'), bodyLimit: 9 * 1024 * 1024 }, async (request) => {
    const user = (request as AuthenticatedRequest).user,
      body = await normalizeOrganizationPatch(organizationPatchSchema.parse(request.body))
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query('SELECT name,settings_version,settings_data FROM organizations WHERE id=$1 FOR UPDATE',[user.organizationId])
      if(!existing.rowCount) fail(404,'Organisation nicht gefunden.')
      const before=organizationView(existing.rows[0])
      if(before.version!==body.version) fail(409,'Die Organisation wurde inzwischen geändert. Bitte neu laden.')
      const {version,name,...changes}=body
      const merged={...existing.rows[0].settings_data,...changes}
      if(changes.taxCertificate) {
        merged.taxCertificate={...changes.taxCertificate,uploadDate:before.taxCertificate?.fileData===changes.taxCertificate.fileData ? before.taxCertificate.uploadDate : new Date().toISOString()}
      }
      const saved=await client.query('UPDATE organizations SET name=$1,settings_data=$2,settings_version=settings_version+1,updated_at=now() WHERE id=$3 AND settings_version=$4 RETURNING name,settings_version,settings_data',[name??before.name,JSON.stringify(merged),user.organizationId,version])
      const after=organizationView(saved.rows[0])
      await client.query('INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$1,$5)',[user.organizationId,user.userId,'UPDATE','organizations',JSON.stringify({before:organizationAudit(before),after:organizationAudit(after)})])
      await client.query('COMMIT')
      return { organization: after }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
  app.get('/settings/preferences', async (request) => {
    const user = (request as AuthenticatedRequest).user
    const result = await getDatabase().query(
      'SELECT * FROM web_user_preferences WHERE user_id=$1',
      [user.userId]
    )
    return { preferences: preferencesView(result.rows[0]) }
  })

  for (const key of ['workflow', 'table'] as const) {
    const schema = key === 'workflow' ? webWorkflowSchema : webTableSchema
    app.get(`/settings/${key}`, async (request) => {
      const user = (request as AuthenticatedRequest).user
      const result = await getDatabase().query(
        'SELECT version, workflow_data, table_data FROM web_user_preferences WHERE user_id=$1',
        [user.userId]
      )
      return extendedView(result.rows[0], key)
    })
    app.patch(`/settings/${key}`, async (request) => {
      const user = (request as AuthenticatedRequest).user
      const body = schema.parse(request.body)
      const client = await getDatabase().connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.userId])
        const current = await client.query(
          'SELECT version, workflow_data, table_data FROM web_user_preferences WHERE user_id=$1',
          [user.userId]
        )
        const currentVersion = current.rows[0]?.version || 0
        if (body.version !== currentVersion)
          fail(409, 'Diese Einstellung wurde inzwischen geändert. Bitte neu laden.')
        const { version: _version, ...settings } = body
        const workflow = key === 'workflow' ? settings : current.rows[0]?.workflow_data || {}
        const table = key === 'table' ? settings : current.rows[0]?.table_data || {}
        const saved = await client.query(
          `INSERT INTO web_user_preferences(user_id, workflow_data, table_data)
           VALUES($1,$2,$3)
           ON CONFLICT(user_id) DO UPDATE SET workflow_data=$2, table_data=$3,
             version=web_user_preferences.version+1, updated_at=NOW()
           RETURNING version, workflow_data, table_data`,
          [user.userId, JSON.stringify(workflow), JSON.stringify(table)]
        )
        await client.query('COMMIT')
        return extendedView(saved.rows[0], key)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    })
  }
  app.patch('/settings/preferences', async (request) => {
    const user = (request as AuthenticatedRequest).user,
      body = webPreferencesSchema.parse(request.body)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      // Serialize the initial insert too, so two clients cannot both overwrite version 0.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.userId])
      const existing = await client.query(
        'SELECT version FROM web_user_preferences WHERE user_id=$1',
        [user.userId]
      )
      if ((existing.rows[0]?.version || 0) !== body.version)
        fail(409, 'Deine Darstellung wurde inzwischen geändert. Bitte neu laden.')
      const saved = await client.query(
        `INSERT INTO web_user_preferences(user_id,theme_mode,color_theme,nav_layout,nav_icon_color_mode)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET theme_mode=EXCLUDED.theme_mode,color_theme=EXCLUDED.color_theme,
        nav_layout=EXCLUDED.nav_layout,nav_icon_color_mode=EXCLUDED.nav_icon_color_mode,version=web_user_preferences.version+1,updated_at=NOW() RETURNING *`,
        [user.userId, body.themeMode, body.colorTheme, body.navLayout, body.navIconColorMode]
      )
      await client.query('COMMIT')
      return { preferences: preferencesView(saved.rows[0]) }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
}
export default webSettingsRoutes
