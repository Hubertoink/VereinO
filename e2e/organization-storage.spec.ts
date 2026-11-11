import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

let root: string
let app: ElectronApplication

test.beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-organization-storage-'))
  await build({
    entryPoints: ['electron/main/db/database.ts'], outfile: path.join(root, 'storage.cjs'),
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(path.resolve('package.json')).href) },
  })
  await fs.writeFile(path.join(root, 'main.cjs'), `
    const { app } = require('electron');
    app.setPath('userData', ${JSON.stringify(path.join(root, 'profile'))});
    global.storage = require('./storage.cjs');
    global.Database = require(${JSON.stringify(path.resolve('node_modules/better-sqlite3'))});
    app.whenReady().then(() => {});
  `)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [path.join(root, 'main.cjs')], env })
})

test.afterAll(async () => {
  if (app) await app.close()
  // root is exclusively this test's mkdtemp directory.
  if (root) await fs.rm(root, { recursive: true, force: true })
})

async function setup(name: string) {
  const base = path.join(root, name)
  const a = path.join(base, 'a'), b = path.join(base, 'b'), target = path.join(base, 'target')
  await fs.mkdir(path.join(a, 'files', 'nested'), { recursive: true })
  await fs.mkdir(path.join(a, 'backups'))
  await fs.mkdir(path.join(b, 'files'), { recursive: true })
  await fs.writeFile(path.join(a, 'files', 'nested', 'receipt.pdf'), 'receipt')
  await fs.writeFile(path.join(a, 'files', 'invoice.pdf'), 'invoice')
  await fs.writeFile(path.join(a, 'backups', 'database_old.sqlite'), 'existing backup')
  await app.evaluate((_electron, { a, b }) => {
    const { storage, Database } = globalThis as any
    storage.closeDb()
    for (const [folder, amount] of [[a, 125], [b, 999]]) {
      const db = new Database(`${folder}/database.sqlite`)
      db.exec('CREATE TABLE vouchers (id INTEGER PRIMARY KEY, amount INTEGER); CREATE TABLE voucher_files (id INTEGER PRIMARY KEY, file_path TEXT); CREATE TABLE invoice_files (id INTEGER PRIMARY KEY, file_path TEXT);')
      db.prepare('INSERT INTO vouchers VALUES (1, ?)').run(amount)
      if (folder === a) {
        db.prepare('INSERT INTO voucher_files VALUES (1, ?)').run(`${a}/files/nested/receipt.pdf`)
        db.prepare('INSERT INTO invoice_files VALUES (1, ?)').run(`${a}/files/invoice.pdf`)
      }
      db.close()
    }
    storage.writeAppConfig({ activeOrgId: 'a', dbRoot: a, organizations: [
      {id:'a',name:'Verein A',dbRoot:a,createdAt:'2026-01-01'},
      {id:'b',name:'Verein B',dbRoot:b,createdAt:'2026-01-01'},
    ] })
    const current = storage.getDb()
    current.pragma('wal_autocheckpoint = 0')
    current.exec('INSERT INTO vouchers VALUES (2, 250)')
  }, { a, b })
  return { a, b, target }
}

test('relocation copies WAL data, nested receipts, invoices and backups and survives switching organizations', async () => {
  const folders = await setup('success')
  const result = await app.evaluate(async (_electron, { target }) => {
    const { storage } = globalThis as any
    await storage.migrateToRoot(target, 'a')
    const config = storage.readAppConfig()
    const current = storage.getDb()
    const receipts = current.prepare('SELECT file_path FROM voucher_files').all()
    const invoices = current.prepare('SELECT file_path FROM invoice_files').all()
    const rows = current.prepare('SELECT * FROM vouchers').all()
    storage.switchOrganization('b')
    const other = storage.getDb().prepare('SELECT * FROM vouchers').all()
    storage.switchOrganization('a')
    const reopened = storage.getCurrentDbInfo()
    storage.closeDb()
    return { config, receipts, invoices, rows, other, reopened }
  }, folders)
  expect(result.config.organizations.map((org: any) => org.dbRoot)).toEqual([folders.target, folders.b])
  expect(result.config.activeOrgId).toBe('a')
  expect(result.rows).toEqual([{ id: 1, amount: 125 }, { id: 2, amount: 250 }])
  expect(result.other).toEqual([{ id: 1, amount: 999 }])
  expect(result.reopened.root).toBe(folders.target)
  expect(result.receipts[0].file_path).toBe(path.join(folders.target, 'files', 'nested', 'receipt.pdf'))
  expect(result.invoices[0].file_path).toBe(path.join(folders.target, 'files', 'invoice.pdf'))
  expect(await fs.readFile(result.receipts[0].file_path, 'utf8')).toBe('receipt')
  expect(await fs.readFile(result.invoices[0].file_path, 'utf8')).toBe('invoice')
  expect(await fs.readFile(path.join(folders.target, 'backups', 'database_old.sqlite'), 'utf8')).toBe('existing backup')
  expect(await fs.readFile(path.join(folders.a, 'files', 'invoice.pdf'), 'utf8')).toBe('invoice')
})

test('rejects other organizations, occupied folders, overlap and stale organization selections', async () => {
  const folders = await setup('rejections')
  const occupied = path.join(root, 'occupied')
  await fs.mkdir(occupied)
  await fs.writeFile(path.join(occupied, 'database.sqlite'), 'do not overwrite')
  const errors = await app.evaluate(async (_electron, { a, b, target, occupied }) => {
    const { storage } = globalThis as any
    const errors: string[] = []
    for (const [destination, organization] of [[b, 'a'], [occupied, 'a'], [a, 'a'], [`${a}/nested`, 'a'], [target, 'b']]) {
      try { await storage.migrateToRoot(destination, organization); errors.push('unexpected success') }
      catch (error) { errors.push((error as Error).message) }
    }
    storage.getDb().exec('INSERT INTO vouchers VALUES (3, 300)')
    return { errors, config: storage.readAppConfig(), count: storage.getDb().prepare('SELECT COUNT(*) n FROM vouchers').get().n }
  }, { ...folders, occupied })
  expect(errors.errors[0]).toContain('Verein B')
  expect(errors.errors[1]).toContain('leeren Zielordner')
  expect(errors.errors[2]).toContain('außerhalb')
  expect(errors.errors[3]).toContain('außerhalb')
  expect(errors.errors[4]).toContain('inzwischen gewechselt')
  expect(errors.config.dbRoot).toBe(folders.a)
  expect(errors.count).toBe(3)
  expect(await fs.readFile(path.join(occupied, 'database.sqlite'), 'utf8')).toBe('do not overwrite')
})

test('junctions cannot bypass another organization ownership check', async () => {
  const folders = await setup('junction')
  const alias = path.join(root, 'alias-to-b')
  await fs.symlink(folders.b, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const error = await app.evaluate(async (_electron, alias) => {
    try { await (globalThis as any).storage.migrateToRoot(alias, 'a'); return '' }
    catch (error) { return (error as Error).message }
  }, alias)
  expect(error).toContain('Verein B')
})

test('missing attachments abort without switching, and the source remains writable', async () => {
  const folders = await setup('missing')
  await fs.unlink(path.join(folders.a, 'files', 'invoice.pdf'))
  const result = await app.evaluate(async (_electron, target) => {
    const { storage } = globalThis as any
    let message = ''
    try { await storage.migrateToRoot(target, 'a') } catch (error) { message = (error as Error).message }
    storage.getDb().exec('INSERT INTO vouchers VALUES (3, 300)')
    return { message, root: storage.getCurrentDbInfo().root, count: storage.getDb().prepare('SELECT COUNT(*) n FROM vouchers').get().n }
  }, folders.target)
  expect(result.message).toContain('Belegdatei')
  expect(result.root).toBe(folders.a)
  expect(result.count).toBe(3)
  await expect(fs.access(path.join(folders.target, 'database.sqlite'))).rejects.toThrow()
})

test('organization switching and writes are blocked while copying', async () => {
  const folders = await setup('concurrent')
  const result = await app.evaluate(async (_electron, target) => {
    const { storage } = globalThis as any
    const source = storage.getDb()
    const moving = storage.migrateToRoot(target, 'a')
    const errors: string[] = []
    for (const operation of [() => storage.switchOrganization('b'), () => storage.getDb(), () => source.exec('INSERT INTO vouchers VALUES (9, 999)')]) {
      try { operation(); errors.push('unexpected success') } catch (error) { errors.push((error as Error).message) }
    }
    await moving
    return { errors, count: storage.getDb().prepare('SELECT COUNT(*) n FROM vouchers').get().n }
  }, folders.target)
  expect(result.errors[0]).toContain('Speicherort')
  expect(result.errors[1]).toContain('Speicherort')
  expect(result.errors[2]).toContain('readonly')
  expect(result.count).toBe(2)
})

test('registered organization path takes precedence over a stale global path', async () => {
  const folders = await setup('stale-global')
  const actual = await app.evaluate((_electron, b) => {
    const { storage } = globalThis as any
    storage.closeDb()
    storage.writeAppConfig({ ...storage.readAppConfig(), dbRoot: b })
    return { root: storage.getCurrentDbInfo().root, amount: storage.getDb().prepare('SELECT amount FROM vouchers WHERE id = 1').get().amount }
  }, folders.b)
  expect(actual).toEqual({ root: folders.a, amount: 125 })
})

test('a legacy installation without registered organizations retains its relocated default organization', async () => {
  const folders = await setup('legacy')
  const result = await app.evaluate(async (_electron, { a, target }) => {
    const { storage } = globalThis as any
    storage.closeDb()
    storage.writeAppConfig({ dbRoot: a })
    await storage.migrateToRoot(target, 'default')
    storage.switchOrganization('default')
    return { root: storage.getCurrentDbInfo().root, orgs: storage.listOrganizations(), count: storage.getDb().prepare('SELECT COUNT(*) n FROM vouchers').get().n }
  }, folders)
  expect(result.root).toBe(folders.target)
  expect(result.orgs).toHaveLength(1)
  expect(result.orgs[0]).toMatchObject({ id: 'default', dbRoot: folders.target, isActive: true })
  expect(result.count).toBe(2)
})

test('a failed configuration commit leaves the original organization active', async () => {
  const folders = await setup('config-failure')
  const blockingDirectory = path.join(root, 'profile', 'config.json.storage-move.tmp')
  await fs.mkdir(blockingDirectory)
  try {
    const result = await app.evaluate(async (_electron, target) => {
      const { storage } = globalThis as any
      let failed = false
      try { await storage.migrateToRoot(target, 'a') } catch { failed = true }
      storage.getDb().exec('INSERT INTO vouchers VALUES (3, 300)')
      return { failed, config: storage.readAppConfig(), root: storage.getCurrentDbInfo().root }
    }, folders.target)
    expect(result.failed).toBe(true)
    expect(result.config.organizations[0].dbRoot).toBe(folders.a)
    expect(result.root).toBe(folders.a)
    expect(await fs.readFile(path.join(folders.a, 'files', 'invoice.pdf'), 'utf8')).toBe('invoice')
  } finally { await fs.rmdir(blockingDirectory) }
})
