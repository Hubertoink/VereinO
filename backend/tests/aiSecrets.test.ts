import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { encryptAiSecret, decryptAiSecret } from '../src/services/aiSecrets.js'
import { aiSettingsSchema } from '../src/routes/webAi.js'
test('AI secrets require a configured key and authenticate organization/provider context', () => {
 const previous = process.env.AI_ENCRYPTION_KEY
 try {
  delete process.env.AI_ENCRYPTION_KEY
  assert.throws(() => encryptAiSecret('test-secret', 1, 'openai'))
  process.env.AI_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  const encrypted = encryptAiSecret('test-secret', 1, 'openai')
  assert.equal(decryptAiSecret(encrypted, 1, 'openai'), 'test-secret')
  assert.throws(() => decryptAiSecret(encrypted, 2, 'openai'))
  assert.throws(() => decryptAiSecret(encrypted, 1, 'mittwald'))
  assert.notEqual(encrypted, encryptAiSecret('test-secret', 1, 'openai'))
  const input = {version:0,enabled:false,provider:'openai',model:'test',textModel:'test'}
  assert(aiSettingsSchema.safeParse(input).success)
  assert(!aiSettingsSchema.safeParse({...input,apiBaseUrl:'http://localhost'}).success)
  assert(!aiSettingsSchema.safeParse({...input,apiKey:'key',removeApiKey:true}).success)
 } finally { if(previous === undefined) delete process.env.AI_ENCRYPTION_KEY; else process.env.AI_ENCRYPTION_KEY = previous }
})
