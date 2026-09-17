import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
function encryptionKey() {
  const value = process.env.AI_ENCRYPTION_KEY || ''
  if (!/^[a-f0-9]{64}$/i.test(value)) throw Object.assign(new Error('KI-Schlüsselspeicher ist auf dem Server noch nicht eingerichtet.'), { statusCode: 503 })
  return Buffer.from(value, 'hex')
}
export function encryptAiSecret(value: string, organizationId: number, provider: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(`${organizationId}:${provider}`))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}
export function decryptAiSecret(value: string, organizationId: number, provider: string): string {
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Ungültiger KI-Schlüsselspeicher.')
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
  cipher.setAAD(Buffer.from(`${organizationId}:${provider}`))
  cipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString('utf8')
}
