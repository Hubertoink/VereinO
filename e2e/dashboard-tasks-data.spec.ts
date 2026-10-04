import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import type { DashboardTasks } from '../shared/dashboardTasks'

test('dashboard tasks use actual SQLite balances, import coverage and recurring schedules', async () => {
  const require = createRequire(path.join(process.cwd(), 'package.json'))
  const schema = await readFile('e2e/fixtures/dashboard-tasks.sql', 'utf8')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vereino-dashboard-data-'))
  try {
    const script = path.join(directory, 'fixture.cjs')
    const result = await build({
      stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
        import { getDashboardTasks } from './electron/main/services/dashboardTasks'
        const Database = require(${JSON.stringify(path.join(process.cwd(), 'node_modules/better-sqlite3'))})
        const RealDate = Date
        global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-04T12:00:00Z'])) } static now() { return new RealDate('2026-10-04T12:00:00Z').getTime() } }
        global.fixtureDb = new Database(':memory:')
        global.fixtureDb.exec(${JSON.stringify(schema)})
        global.fixtureBackups = [{ size: 100, mtime: Date.parse('2026-09-01T12:00:00Z') }]
        ;(async () => {
          const first = await getDashboardTasks('2026-10-04')
          global.fixtureDb.prepare("INSERT INTO settings VALUES (?,?)").run('dashboard.bankReminderDays.1','0')
          global.fixtureDb.exec("INSERT INTO membership_payments VALUES (2,7,'2026-07','2026-10-04'),(3,7,'2026-08','2026-10-04'),(4,7,'2026-09','2026-10-04')")
          global.fixtureBackups = [{ size:100, mtime:Date.now() }]
          const second = await getDashboardTasks('2026-10-04')
          console.log(JSON.stringify({first,second}))
          global.fixtureDb.close()
        })().catch(error => { console.error(error); process.exit(1) })
      ` }, bundle: true, platform: 'node', format: 'cjs', write: false,
      plugins: [{ name: 'fixture-environment', setup(builder) {
        builder.onResolve({ filter: /better-sqlite3$/ }, args => ({ path: args.path, external: true }))
        builder.onResolve({ filter: /db\/database$/ }, () => ({ path: 'database', namespace: 'fixture' }))
        builder.onLoad({ filter: /database/, namespace: 'fixture' }, () => ({ contents: 'export const getDb = () => global.fixtureDb; export const withTransaction = fn => fn(global.fixtureDb);', loader: 'js' }))
        builder.onResolve({ filter: /^\.\/backup$/ }, () => ({ path: 'backup', namespace: 'fixture' }))
        builder.onLoad({ filter: /backup/, namespace: 'fixture' }, () => ({ contents: 'export const listBackups = async () => ({ backups: global.fixtureBackups });', loader: 'js' }))
      } }]
    })
    await writeFile(script, result.outputFiles[0].text)
    const output = execFileSync(require('electron'), [script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    const { first, second } = JSON.parse(output) as { first: DashboardTasks; second: DashboardTasks }
    const group = (kind: string) => first.groups.find(group => group.kind === kind)!
    expect(first.bankAccounts).toHaveLength(1)
    expect(first.bankAccounts[0].lastImportAt).toBe('2026-09-16 12:00:00')
    expect(group('bank').items).toHaveLength(2)
    expect(group('members').count).toBe(1)
    expect(group('members').items[0].amount).toBe(30)
    expect(group('invoices').items.find(item => item.title === 'Teilbezahlt')?.amount).toBe(60)
    expect(group('invoices').items.find(item => item.title === 'Heute')?.level).toBe('soon')
    expect(group('invoices').items.some(item => item.title === 'Bezahlt')).toBe(false)
    expect(group('receivables').items[0].amount).toBe(90)
    expect(group('recurring').items.filter(item => item.title === 'Hosting')).toHaveLength(1)
    expect(group('recurring').items.some(item => item.title === 'Pausiert')).toBe(false)
    expect(group('recurring').items.find(item => item.title === 'Variabel')?.amount).toBeUndefined()
    expect(group('reimbursements').items[0].amount).toBe(60)
    expect(group('advances').count).toBe(1)
    expect(group('submissions').count).toBe(1)
    expect(group('ai').count).toBe(1)
    expect(group('budgets').items[0].amount).toBe(50)
    expect(group('bindings').items[0].amount).toBe(80)
    expect(group('backup').level).toBe('soon')
    expect(second.groups.find(group => group.kind === 'bank')?.items).toHaveLength(1)
    expect(second.groups.find(group => group.kind === 'members')?.level).toBe('clear')
    expect(second.groups.find(group => group.kind === 'backup')?.level).toBe('clear')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
