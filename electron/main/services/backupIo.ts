import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { BackupProgress } from '../../../shared/backupProgress'

export type BackupFile = { filePath: string; size: number; mtime: number }
export type BackupIoRequest =
  | { action: 'probe' | 'list'; dir: string }
  | { action: 'snapshot'; source: string; destination: string }
  | { action: 'publish'; source: string; dir: string }
  | { action: 'rotate'; dir: string; keep: number }
  | { action: 'migrate'; source: string; dir: string }
export type BackupIoResult = { files?: BackupFile[]; filePath?: string; moved?: number }
export type IoProgress = Pick<BackupProgress, 'stage' | 'message' | 'completedBytes' | 'totalBytes'>
const backupName = /^database_[\w-]+\.sqlite$/i
const snapshotPath = (file: string) => file.replace(/\.sqlite$/i, '.files')

async function exists(file: string) {
  try { await fs.lstat(file); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function listBackupFiles(dir: string): Promise<BackupFile[]> {
  const files: BackupFile[] = []
  if (!await exists(dir)) return files
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !backupName.test(entry.name)) continue
    const filePath = path.join(dir, entry.name)
    const stat = await fs.stat(filePath)
    files.push({ filePath, size: stat.size, mtime: stat.mtimeMs })
  }
  return files.sort((a, b) => b.mtime - a.mtime)
}

type CopyFile = { source: string; relative: string; size: number }
async function collectFiles(dir: string, relative = ''): Promise<CopyFile[]> {
  const files: CopyFile[] = []
  for (const entry of await fs.readdir(path.join(dir, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(dir, name))
    else if (entry.isFile()) files.push({ source: path.join(dir, name), relative: name, size: (await fs.stat(path.join(dir, name))).size })
    else throw new Error(`Verknüpfungen oder besondere Dateien können nicht gesichert werden: ${name}`)
  }
  return files
}

async function copyFiles(files: CopyFile[], destination: string, verify: boolean, report: (progress: IoProgress) => void) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  let completedBytes = 0
  let lastReport = 0
  const stage = verify ? 'transfer' : 'attachments'
  const message = verify ? 'Sicherung wird zum Zielordner übertragen …' : 'Belege werden lokal gesichert …'
  report({ stage, message, completedBytes, totalBytes })
  const hashes: Array<{ file: string; hash: string }> = []
  for (const file of files) {
    const target = path.join(destination, file.relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    const hash = createHash('sha256')
    await pipeline(createReadStream(file.source), new Transform({ transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      completedBytes += chunk.length
      if (Date.now() - lastReport > 250) {
        report({ stage, message, completedBytes, totalBytes })
        lastReport = Date.now()
      }
      callback(null, chunk)
    } }), createWriteStream(target, { flags: 'wx' }))
    const handle = await fs.open(target, 'r+')
    try { await handle.sync() } finally { await handle.close() }
    hashes.push({ file: target, hash: hash.digest('hex') })
    report({ stage, message, completedBytes, totalBytes })
  }
  if (!verify) return
  completedBytes = 0
  report({ stage: 'verify', message: 'Übertragene Sicherung wird geprüft …', completedBytes, totalBytes })
  for (const expected of hashes) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(expected.file)) {
      hash.update(chunk)
      completedBytes += chunk.length
      if (Date.now() - lastReport > 250) {
        report({ stage: 'verify', message: 'Übertragene Sicherung wird geprüft …', completedBytes, totalBytes })
        lastReport = Date.now()
      }
    }
    if (hash.digest('hex') !== expected.hash) throw new Error('Die übertragene Sicherung stimmt nicht mit der lokalen Kopie überein.')
    report({ stage: 'verify', message: 'Übertragene Sicherung wird geprüft …', completedBytes, totalBytes })
  }
}

async function publish(source: string, dir: string, report: (progress: IoProgress) => void): Promise<string> {
  const name = path.basename(source)
  if (!backupName.test(name)) throw new Error('Ungültiger Sicherungsname.')
  await fs.mkdir(dir, { recursive: true })
  const finalFile = path.join(dir, name)
  const finalFiles = snapshotPath(finalFile)
  if (await exists(finalFile) || await exists(finalFiles)) throw new Error('Eine Sicherung mit diesem Namen ist bereits vorhanden.')
  // Incomplete transfers are deliberately invisible to listing and rotation.
  const staging = path.join(dir, `.${name}.${randomUUID()}.partial`)
  await fs.mkdir(staging)
  const files: CopyFile[] = [{ source, relative: name, size: (await fs.stat(source)).size }]
  const attachments = snapshotPath(source)
  if (await exists(attachments)) {
    for (const file of await collectFiles(attachments)) files.push({ ...file, relative: path.join(path.basename(finalFiles), file.relative) })
  }
  await fs.mkdir(path.join(staging, path.basename(finalFiles)))
  await copyFiles(files, staging, true, report)
  await fs.rename(path.join(staging, path.basename(finalFiles)), finalFiles)
  // Publishing the database LAST is the commit marker for the complete pair.
  await fs.rename(path.join(staging, name), finalFile)
  await fs.rmdir(staging).catch(() => undefined)
  return finalFile
}

export async function handleBackupIo(request: BackupIoRequest, report: (progress: IoProgress) => void = () => {}): Promise<BackupIoResult> {
  switch (request.action) {
    case 'probe': {
      await fs.mkdir(request.dir, { recursive: true })
      const probe = path.join(request.dir, `.vereino-write-test-${randomUUID()}`)
      await fs.writeFile(probe, 'VereinO', { flag: 'wx' })
      await fs.unlink(probe)
      return {}
    }
    case 'list': return { files: await listBackupFiles(request.dir) }
    case 'snapshot': {
      await fs.mkdir(request.destination, { recursive: true })
      const files = await collectFiles(request.source)
      await copyFiles(files, request.destination, false, report)
      return {}
    }
    case 'publish': return { filePath: await publish(request.source, request.dir, report) }
    case 'rotate': {
      for (const file of (await listBackupFiles(request.dir)).slice(Math.max(1, request.keep))) {
        // All deletion targets originate from a direct, regular-file directory listing.
        await fs.unlink(file.filePath)
        await fs.rm(snapshotPath(file.filePath), { recursive: true, force: true })
        report({ stage: 'rotation', message: 'Alte Sicherungen werden bereinigt …' })
      }
      return {}
    }
    case 'migrate': {
      let moved = 0
      for (const file of await listBackupFiles(request.source)) {
        if (await exists(path.join(request.dir, path.basename(file.filePath)))) continue
        await publish(file.filePath, request.dir, report)
        moved++
      }
      return { moved }
    }
  }
}
