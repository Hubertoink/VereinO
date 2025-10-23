import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const app = Fastify({ logger: true })
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

await app.register(cors, { origin: true, credentials: true })
await app.register(jwt, { secret: JWT_SECRET })

const prisma = new PrismaClient()

app.get('/health', async () => ({ ok: true }))

// Simple auth-free ping route for now
app.get('/v1/vouchers', async () => {
  // placeholder: return 0 rows to validate connectivity
  try {
    const rows = await prisma.voucher.findMany({ take: 20, orderBy: { date: 'desc' } })
    return { rows }
  } catch (e: any) {
    return { rows: [], error: e?.message || String(e) }
  }
})

app.post('/v1/vouchers', async (req, res) => {
  const Body = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(['IN','OUT','TRANSFER']),
    sphere: z.enum(['IDEELL','ZWECK','VERMOEGEN','WGB']).default('IDEELL'),
    description: z.string().max(255).optional(),
    paymentMethod: z.enum(['BAR','BANK']).optional(),
    grossAmount: z.number().nonnegative().optional(),
    netAmount: z.number().nonnegative().optional(),
    vatRate: z.number().min(0).max(99).optional()
  })
  const b = Body.parse((req as any).body)
  const row = await prisma.voucher.create({ data: {
    date: b.date,
    type: b.type,
    sphere: b.sphere,
    description: b.description ?? null,
    paymentMethod: b.paymentMethod ?? null,
    grossAmount: b.grossAmount ?? null,
    netAmount: b.netAmount ?? null,
    vatRate: b.vatRate ?? null
  }})
  return res.code(201).send({ id: row.id })
})

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`API listening on :${PORT}`)
}).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
