import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { pathExists, sha256Buffer, sha256File } from '../asyncFile'

describe('async file helpers', () => {
  it('hashes buffers and files identically without synchronous reads', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-async-file-'))
    const filePath = path.join(tempDir, 'sample.bin')
    const data = Buffer.from('VereinO async file hashing')

    try {
      await fs.writeFile(filePath, data)

      await expect(pathExists(filePath)).resolves.toBe(true)
      await expect(sha256File(filePath)).resolves.toBe(await sha256Buffer(data))
      await expect(pathExists(path.join(tempDir, 'missing.bin'))).resolves.toBe(false)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
