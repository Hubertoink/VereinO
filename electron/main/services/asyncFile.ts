import { createHash, webcrypto } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'

export async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function sha256Buffer(data: Buffer | Uint8Array) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  const digest = await webcrypto.subtle.digest('SHA-256', bytes)
  return Buffer.from(digest).toString('hex')
}

export function sha256File(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
