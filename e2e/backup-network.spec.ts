import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

let root: string
let app: ElectronApplication
let workerCode: string
test.beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-backup-network-'))
  workerCode = await fs.readFile('dist-electron/main/backupIo.cjs', 'utf8')
  await build({ entryPoints: ['electron/main/services/backupWorker.ts'], outfile: path.join(root, 'supervisor.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
  await fs.writeFile(path.join(root, 'main.cjs'), `const { app } = require('electron'); global.runBackupIo = require('./supervisor.cjs').runBackupIo; global.Database = require(${JSON.stringify(path.resolve('node_modules/better-sqlite3'))}); app.whenReady().then(() => {});`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [path.join(root, 'main.cjs'), `--user-data-dir=${path.join(root, 'profile')}`], env })
})
test.beforeEach(async () => { await fs.writeFile(path.join(root, 'backupIo.cjs'), workerCode) })
test.afterAll(async () => {
  if (app) await app.close()
  if (root) await fs.rm(root, { recursive: true, force: true })
})

test('the production helper transfers and verifies a database with its attachments in Electron', async () => {
  const source = path.join(root, 'database_smoke.sqlite')
  await fs.writeFile(source, 'consistent database')
  await fs.mkdir(source.replace('.sqlite', '.files'))
  await fs.writeFile(path.join(source.replace('.sqlite', '.files'), 'receipt.pdf'), 'receipt bytes')
  const result = await app.evaluate(async (_electron, request) => {
    const stages: string[] = []
    const result = await (globalThis as any).runBackupIo(request, (update: any) => stages.push(update.stage))
    return { ...result, stages }
  }, { action: 'publish', source, dir: path.join(root, 'network-target') })
  expect(await fs.readFile(result.filePath, 'utf8')).toBe('consistent database')
  expect(await fs.readFile(path.join(result.filePath.replace('.sqlite', '.files'), 'receipt.pdf'), 'utf8')).toBe('receipt bytes')
  expect(result.stages).toEqual(expect.arrayContaining(['transfer', 'verify']))
})

test('a completely blocked helper is terminated while the Electron main process remains responsive', async () => {
  await fs.writeFile(path.join(root, 'backupIo.cjs'), `process.parentPort.once('message', () => { while (true) {} });`)
  const result = await app.evaluate(async () => {
    let ticks = 0
    const timer = setInterval(() => ticks++, 20)
    try {
      await (globalThis as any).runBackupIo({ action: 'list', dir: 'H:\\Backups' }, undefined, { idleMs: 1500, totalMs: 3000 })
      return { error: '', ticks }
    } catch (error) { return { error: (error as Error).message, ticks } }
    finally { clearInterval(timer) }
  })
  expect(result.error).toContain('Zeitüberschreitung')
  expect(result.ticks).toBeGreaterThan(10)
  await fs.writeFile(path.join(root, 'backupIo.cjs'), workerCode)
  const resultAfterTimeout = await app.evaluate(async (_electron, dir) => (globalThis as any).runBackupIo({ action: 'list', dir }), root)
  expect(resultAfterTimeout.files).toBeDefined()
})

test('an online SQLite snapshot includes WAL transactions before being transferred', async () => {
  const result = await app.evaluate(async (_electron, root) => {
    const Database = (globalThis as any).Database
    const db = new Database(`${root}/active.sqlite`)
    let copied: any
    try {
      db.pragma('journal_mode = WAL')
      db.pragma('wal_autocheckpoint = 0')
      db.exec('CREATE TABLE vouchers (id INTEGER, amount INTEGER); INSERT INTO vouchers VALUES (1, 4250)')
      const source = `${root}/database_wal.sqlite`
      await db.backup(source)
      const result = await (globalThis as any).runBackupIo({ action: 'publish', source, dir: `${root}/wal-target` })
      copied = new Database(result.filePath, { readonly: true })
      return { row: copied.prepare('SELECT * FROM vouchers').get(), integrity: copied.pragma('integrity_check', { simple: true }) }
    } finally { copied?.close(); db.close() }
  }, root)
  expect(result).toEqual({ row: { id: 1, amount: 4250 }, integrity: 'ok' })
})

test('a crashing helper reports failure without crashing VereinO', async () => {
  await fs.writeFile(path.join(root, 'backupIo.cjs'), `process.parentPort.once('message', () => process.exit(17));`)
  const message = await app.evaluate(async () => {
    try { await (globalThis as any).runBackupIo({ action: 'list', dir: 'H:\\Backups' }); return '' }
    catch (error) { return (error as Error).message }
  })
  expect(message).toContain('unerwartet beendet (17)')
})
