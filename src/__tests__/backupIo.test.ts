import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleBackupIo, listBackupFiles } from '../../electron/main/services/backupIo'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-backup-io-test-')) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

async function fixture(name = 'database_2026-11-11_manual_test.sqlite') {
  const source = path.join(root, 'local', name)
  await fs.mkdir(source.replace('.sqlite', '.files'), { recursive: true })
  await fs.writeFile(source, 'consistent database snapshot')
  await fs.writeFile(path.join(source.replace('.sqlite', '.files'), 'receipt.pdf'), 'receipt bytes')
  return source
}

test('publishes a verified database and matching attachments, exposing neither during transfer', async () => {
  const source = await fixture()
  const dir = path.join(root, 'share')
  const stages: string[] = []
  const result = await handleBackupIo({ action: 'publish', source, dir }, progress => {
    stages.push(progress.stage)
    expect(fsSync.readdirSync(dir).filter(name => name.endsWith('.sqlite'))).toEqual([])
  })
  expect(await fs.readFile(result.filePath!, 'utf8')).toBe('consistent database snapshot')
  expect(await fs.readFile(path.join(result.filePath!.replace('.sqlite', '.files'), 'receipt.pdf'), 'utf8')).toBe('receipt bytes')
  expect(stages).toContain('transfer')
  expect(stages).toContain('verify')
  expect(await listBackupFiles(dir)).toHaveLength(1)
  expect((await fs.readdir(dir)).some(name => name.endsWith('.partial'))).toBe(false)
})

test('rejects a corrupted transfer and keeps the local copy and previous backups intact', async () => {
  const source = await fixture()
  const dir = path.join(root, 'share')
  await fs.mkdir(dir)
  const previous = path.join(dir, 'database_previous.sqlite')
  await fs.writeFile(previous, 'previous backup')
  let corrupted = false
  await expect(handleBackupIo({ action: 'publish', source, dir }, progress => {
    if (progress.stage !== 'verify' || corrupted) return
    corrupted = true
    const temporary = fsSync.readdirSync(dir).find(name => name.endsWith('.partial'))!
    fsSync.writeFileSync(path.join(dir, temporary, path.basename(source)), 'broken')
  })).rejects.toThrow('stimmt nicht')
  expect(await fs.readFile(source, 'utf8')).toBe('consistent database snapshot')
  expect((await listBackupFiles(dir)).map(file => file.filePath)).toEqual([previous])
  expect(await fs.readFile(previous, 'utf8')).toBe('previous backup')
})

test('does not overwrite a published backup or an orphan attachment directory', async () => {
  const source = await fixture()
  const dir = path.join(root, 'share')
  await fs.mkdir(path.join(dir, path.basename(source).replace('.sqlite', '.files')), { recursive: true })
  await expect(handleBackupIo({ action: 'publish', source, dir })).rejects.toThrow('bereits vorhanden')
})

test('rotation touches only owned backups and retains unrelated files and incomplete transfers', async () => {
  const dir = path.join(root, 'share')
  await fs.mkdir(dir)
  for (let i = 0; i < 3; i++) {
    const file = path.join(dir, `database_${i}.sqlite`)
    await fs.writeFile(file, 'backup')
    await fs.utimes(file, new Date(1000 * i), new Date(1000 * i))
    await fs.mkdir(file.replace('.sqlite', '.files'))
  }
  await fs.writeFile(path.join(dir, 'accounting.sqlite'), 'unrelated')
  await fs.mkdir(path.join(dir, '.unfinished.partial'))
  await handleBackupIo({ action: 'rotate', dir, keep: 1 })
  expect((await fs.readdir(dir)).sort()).toEqual(['.unfinished.partial', 'accounting.sqlite', 'database_2.files', 'database_2.sqlite'])
})

test('migration copies paired backups, skips existing copies and leaves originals intact', async () => {
  const source = await fixture()
  const dir = path.join(root, 'share')
  const request = { action: 'migrate' as const, source: path.dirname(source), dir }
  expect(await handleBackupIo(request)).toEqual({ moved: 1 })
  expect(await handleBackupIo(request)).toEqual({ moved: 0 })
  expect(await fs.readFile(source, 'utf8')).toBe('consistent database snapshot')
})

test('failed destination access rejects instead of claiming success', async () => {
  const source = await fixture()
  const dir = path.join(root, 'not-a-directory')
  await fs.writeFile(dir, 'file')
  await expect(handleBackupIo({ action: 'publish', source, dir })).rejects.toThrow()
  await expect(handleBackupIo({ action: 'probe', dir })).rejects.toThrow()
})
