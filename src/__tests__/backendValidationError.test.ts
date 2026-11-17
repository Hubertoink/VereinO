import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { z, ZodError } from 'zod'

// The cloud package is independently installed. Load this pure handler without
// requiring the Fastify server or PostgreSQL in the desktop test environment.
const source = fs.readFileSync(path.join(process.cwd(), 'backend/src/middleware/error.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const moduleExports: Record<string, (...args: unknown[]) => unknown> = {}
vm.runInNewContext(compiled, {
  exports: moduleExports,
  require: (name: string) => {
    if (name === 'zod') return { ZodError }
    throw new Error(`Unexpected runtime dependency: ${name}`)
  }
})

function handle(error: unknown) {
  const send = jest.fn()
  const status = jest.fn((_code: number) => ({ send }))
  moduleExports.errorHandler(error, { log: { error: jest.fn() }, url: '/api/auth/register', method: 'POST' }, { status })
  return { status: status.mock.calls[0][0], body: send.mock.calls[0][0] }
}

it('returns actionable 400 validation details for Zod request errors', () => {
  const result = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse({ email: 'invalid', password: 'x' })
  if (result.success) throw new Error('Expected invalid fixture')
  const response = handle(result.error)
  expect(response.status).toBe(400)
  expect(response.body).toMatchObject({ error: 'Validation Error', message: 'Invalid request data' })
  expect(response.body.details).toEqual(result.error.issues)
})

it('preserves Fastify validation and ordinary server-error responses', () => {
  expect(handle({ message: 'Bad request', validation: [{ instancePath: '/date' }] })).toEqual({
    status: 400, body: { error: 'Validation Error', message: 'Bad request', details: [{ instancePath: '/date' }] }
  })
  expect(handle(new Error('Database credentials must stay private'))).toEqual({
    status: 500, body: { error: 'Error', message: 'An unexpected error occurred' }
  })
})
