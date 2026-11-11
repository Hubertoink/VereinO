import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getBackupDir, getBackupProgress, makeBackup, setBackupDirWithMigration } from '../../electron/main/services/backup'
import { handleBackupIo } from '../../electron/main/services/backupIo'
import { runBackupIo } from '../../electron/main/services/backupWorker'

let mockRoot = ''
let mockConfigured: string | null = null
const mockBackup = jest.fn(async (file: string) => { await fs.writeFile(file, 'consistent SQLite snapshot') })
jest.mock('electron', () => ({
  app: { getPath: () => mockRoot }, BrowserWindow: { getAllWindows: () => [] }, shell: { openPath: jest.fn() }
}))
jest.mock('../../electron/main/db/database', () => ({
  getAppDataDir: () => ({ root: path.join(mockRoot, 'data') }),
  getCurrentDbInfo: () => ({ filesDir: path.join(mockRoot, 'attachments') }),
  getDb: () => ({ backup: mockBackup })
}))
jest.mock('../../electron/main/db/migrations', () => ({ applyMigrations: jest.fn() }))
jest.mock('../../electron/main/services/settings', () => ({
  getSetting: () => mockConfigured,
  setSetting: (_key: string, value: string | null) => { mockConfigured = value }
}))
jest.mock('../../electron/main/services/backupWorker', () => ({ runBackupIo: jest.fn() }))
const originalLocalAppData = process.env.LOCALAPPDATA

beforeEach(async () => {
  mockRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-backup-flow-test-'))
  process.env.LOCALAPPDATA = mockRoot
  mockConfigured = path.join(mockRoot, 'network-target')
  await fs.mkdir(path.join(mockRoot, 'attachments'))
  await fs.writeFile(path.join(mockRoot, 'attachments', 'receipt.pdf'), 'receipt')
  mockBackup.mockClear()
  ;(runBackupIo as jest.Mock).mockReset().mockImplementation(handleBackupIo)
})
afterEach(async () => {
  if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA
  else process.env.LOCALAPPDATA = originalLocalAppData
  await fs.rm(mockRoot, { recursive: true, force: true })
})

test('creates SQLite locally first, publishes the pair and retains a diagnostic log', async () => {
  const result = await makeBackup('manual')
  const snapshotFile = mockBackup.mock.calls[0][0]
  expect(snapshotFile.startsWith(mockConfigured!)).toBe(false)
  expect(snapshotFile.endsWith('.partial')).toBe(true)
  expect(await fs.readFile(result.filePath, 'utf8')).toBe('consistent SQLite snapshot')
  expect(await fs.readFile(path.join(result.filePath.replace('.sqlite', '.files'), 'receipt.pdf'), 'utf8')).toBe('receipt')
  expect(await fs.readFile(result.logFilePath!, 'utf8')).toContain('"stage":"done"')
  expect(getBackupProgress()).toMatchObject({ active: false, stage: 'done', localFilePath: undefined })
  await expect(fs.access(snapshotFile.replace('.partial', ''))).rejects.toThrow()
})

test('a disconnected destination preserves the complete local copy and the configured drive', async () => {
  const target = mockConfigured
  ;(runBackupIo as jest.Mock).mockImplementation((request, report) => {
    if (request.action === 'publish') throw new Error('Zeitüberschreitung')
    return handleBackupIo(request, report)
  })
  await expect(makeBackup('manual')).rejects.toThrow('vollständige lokale Sicherung bleibt erhalten')
  const progress = getBackupProgress()!
  expect(progress).toMatchObject({ active: false, stage: 'error' })
  expect(await fs.readFile(progress.localFilePath!, 'utf8')).toBe('consistent SQLite snapshot')
  expect(await fs.readFile(path.join(progress.localFilePath!.replace('.sqlite', '.files'), 'receipt.pdf'), 'utf8')).toBe('receipt')
  expect(await fs.readFile(progress.logFilePath!, 'utf8')).toContain('Zeitüberschreitung')
  expect(getBackupDir()).toBe(target)
  expect((runBackupIo as jest.Mock).mock.calls.some(([request]) => request.action === 'rotate')).toBe(false)
})

test('a failed local snapshot is never published as a complete backup', async () => {
  ;(runBackupIo as jest.Mock).mockRejectedValue(new Error('Belegdatei nicht lesbar'))
  await expect(makeBackup()).rejects.toThrow('nicht vollständig erstellt')
  expect(getBackupProgress()?.localFilePath).toBeUndefined()
  expect((runBackupIo as jest.Mock).mock.calls.map(([request]) => request.action)).toEqual(['snapshot'])
})

test('rotation failure reports a warning without losing a completed backup', async () => {
  ;(runBackupIo as jest.Mock).mockImplementation((request, report) => {
    if (request.action === 'rotate') throw new Error('Laufwerk nicht erreichbar')
    return handleBackupIo(request, report)
  })
  const result = await makeBackup()
  expect(result.warning).toContain('Alte Sicherungen konnten nicht bereinigt')
  expect(await fs.readFile(result.filePath, 'utf8')).toBe('consistent SQLite snapshot')
})

test('rejects concurrent backups and destination changes', async () => {
  let release!: () => void
  let ready!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const reached = new Promise<void>(resolve => { ready = resolve })
  ;(runBackupIo as jest.Mock).mockImplementation(async (request, report) => {
    if (request.action === 'publish') { ready(); await blocked }
    return handleBackupIo(request, report)
  })
  const first = makeBackup()
  await reached
  await expect(makeBackup()).rejects.toThrow('läuft bereits')
  expect(await setBackupDirWithMigration(path.join(mockRoot, 'different'))).toMatchObject({ ok: false })
  release()
  await first
})

test('reading the configured path never probes the network and a failed change preserves it', async () => {
  const previous = mockConfigured
  expect(getBackupDir()).toBe(previous)
  expect(runBackupIo).not.toHaveBeenCalled()
  ;(runBackupIo as jest.Mock).mockRejectedValue(new Error('Kein Schreibzugriff'))
  expect(await setBackupDirWithMigration('H:\\Backups')).toMatchObject({ ok: false, dir: previous, error: 'Kein Schreibzugriff' })
  expect(getBackupDir()).toBe(previous)
})
