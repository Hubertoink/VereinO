import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { initializeDatabase } from './config/database.js'
import authRoutes from './routes/auth.js'
import attachmentRoutes from './routes/attachments.js'
import recurringRoutes from './routes/webRecurring.js'
import settingsRoutes from './routes/webSettings.js'
import planningRoutes from './routes/planning.js'
import webMembersRoutes from './routes/webMembers.js'
import bankImportRoutes from './routes/webBankImport.js'
import workflowRoutes from './routes/workflow.js'
import webAi from './routes/webAi.js'
import webProfiles from './routes/webProfiles.js'
import webOrganizations from './routes/webOrganizations.js'
import { errorHandler } from './middleware/error.js'
import { authenticate, protectMutation } from './middleware/auth.js'

export function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    bodyLimit: 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY_HOPS === '1' ? 1 : false
  })
  app.decorate('authenticate', authenticate)
  app.addHook('onRequest', protectMutation)
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store')
    reply.header('x-content-type-options', 'nosniff')
    return payload
  })
  // Per-process limiter; deployments with multiple replicas need a shared store.
  const attempts = new Map<string, { count: number; expires: number }>()
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.method !== 'POST' ||
      !/^\/api\/auth\/(login|setup)$/.test(request.url.split('?')[0])
    )
      return
    const now = Date.now()
    for (const [key, item] of attempts) if (item.expires < now) attempts.delete(key)
    const item = attempts.get(request.ip) ?? { count: 0, expires: now + 15 * 60 * 1000 }
    item.count++
    attempts.set(request.ip, item)
    if (item.count > 20)
      return reply
        .code(429)
        .header('retry-after', String(Math.ceil((item.expires - now) / 1000)))
        .send({ error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' })
  })
  app.register(multipart, {
    limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, files: 1 }
  })
  app.get('/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })
  app.register(attachmentRoutes, { prefix: '/api' })
  app.register(recurringRoutes, { prefix: '/api' })
  app.register(settingsRoutes, { prefix: '/api' })
  app.register(planningRoutes, { prefix: '/api' })
  app.register(webMembersRoutes, { prefix: '/api' })
  app.register(bankImportRoutes, { prefix: '/api' })
  app.register(workflowRoutes, { prefix: '/api' })
  app.register(webProfiles, { prefix: '/api' })
  app.register(webOrganizations, { prefix: '/api' })
  app.register(webAi, { prefix: '/api' })
  app.setErrorHandler(errorHandler)
  return app
}
async function startServer() {
  await initializeDatabase()
  const app = buildApp()
  await app.listen({ port: Number(process.env.PORT) || 3000, host: process.env.HOST || '0.0.0.0' })
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, async () => {
      await app.close()
      process.exit(0)
    })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
