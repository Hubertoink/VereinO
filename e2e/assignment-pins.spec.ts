import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/finance/financeOverview.css', 'src/renderer/components/layout/sidebar.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import AssignmentOverview from './src/renderer/components/finance/AssignmentOverview'
    import { SidebarRecentAssignments } from './src/renderer/components/layout/SidebarRecentAssignments'
    const rows = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Archiviert'].map((name, i) => ({ id: i + 1, name, year: 2026, amountPlanned: 0, isArchived: i === 4 ? 1 : 0, isActive: i === 4 ? 0 : 1 }))
    const listeners = new Set()
    const root = createRoot(document.getElementById('root'))
    let revision = 0
    window.org = 'a'; window.savedPins = { a: {}, b: { 'sidebar.pinned.budget': [1], 'sidebar.pinned.earmark': [] } }
    window.failWrite = false; window.failRead = false; window.holdRead = false; window.pending = []
    window.api = {
      settings: {
        get: async ({key}) => {
          if (window.failRead) throw Error('Read failed')
          const value = window.savedPins[window.org][key]
          if (window.holdRead) await new Promise(resolve => window.pending.push(resolve))
          return {value}
        },
        set: async ({key,value}) => { if (window.failWrite) throw Error('Write failed'); window.savedPins[window.org][key] = value; return {ok:true} }
      },
      budgets: { list: async () => ({rows}), usage: async () => ({planned:0,inflow:100,spent:350}) },
      bindings: { list: async () => ({rows}), usage: async () => ({budget:0,allocated:100,released:350}) },
      organizations: { onSwitched: callback => {listeners.add(callback); return () => listeners.delete(callback)} }
    }
    window.switchOrg = org => { window.org = org; listeners.forEach(callback => callback({id:org})) }
    window.mountPins = () => root.render(<div key={++revision} style={{display:'grid',gridTemplateColumns:'240px minmax(0,1fr)',gap:24,padding:16}}>
      <aside><SidebarRecentAssignments kind="budget" onSelect={(kind,id) => {window.selection={kind,id}}}/><SidebarRecentAssignments kind="earmark" onSelect={() => {}}/></aside>
      <main>{['budget','earmark'].map(kind => <AssignmentOverview key={kind} kind={kind} sortable definitions={rows.map(row => ({id:row.id,name:row.name,plan:0,caption:kind==='budget'?'2026':'Z'+row.id,archived:!!row.isArchived}))}/>)}</main>
    </div>)
    window.mountPins()
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.setContent('<html data-theme="dark"><div id="root"></div></html>')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('stars appear on hover and focus, persist selections beyond three entries and allow an empty sidebar', async ({ page }, info) => {
  const table = page.getByRole('region', { name: 'Budgetentwicklung', exact: true })
  const sidebar = page.getByRole('group', { name: 'Aktuelle Budgets' })
  const star = table.getByRole('button', { name: 'Alpha: In der Seitenleiste anzeigen', exact: true })
  await expect(star).toBeEnabled()
  await expect(star).toHaveCSS('opacity', '0')
  await table.getByRole('row').filter({ hasText: 'Alpha' }).hover()
  await expect(star).toHaveCSS('opacity', '1')
  await expect(star).toHaveAttribute('title', 'In der Seitenleiste anzeigen')
  await page.mouse.move(0, 0)
  await star.focus()
  await expect(star).toHaveCSS('opacity', '1')
  await star.press('Enter')
  await expect(sidebar.getByRole('button')).toHaveCount(4)
  await expect(table.getByRole('button', { name: 'Alpha: Aus der Seitenleiste entfernen' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sidebar.getByRole('button', { name: /Alpha/ })).toContainText('-250,00')
  await expect(table.getByRole('button', { name: /Archiviert:.*Seitenleiste/ })).toHaveCount(0)
  await page.evaluate(() => (window as any).mountPins())
  await expect(sidebar.getByRole('button')).toHaveCount(4)
  await page.screenshot({ path: info.outputPath('pinned-assignments-dark.png'), fullPage: true })
  for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
    await table.getByRole('button', { name: `${name}: Aus der Seitenleiste entfernen`, exact: true }).click()
  }
  await expect(sidebar).toHaveCount(0)
  await page.evaluate(() => (window as any).mountPins())
  await expect(table.getByRole('button', { name: 'Alpha: In der Seitenleiste anzeigen' })).toBeEnabled()
  await expect(sidebar).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).savedPins.a['sidebar.pinned.budget'])).toEqual([])
})

test('budgets and earmarks have independent selections and failed saves preserve the current choice', async ({ page }) => {
  const table = page.getByRole('region', { name: 'Entwicklung der Zweckbindungen', exact: true })
  const budgets = page.getByRole('group', { name: 'Aktuelle Budgets' })
  const earmarks = page.getByRole('group', { name: 'Aktuelle Zweckbindungen' })
  await table.getByRole('button', { name: 'Alpha: In der Seitenleiste anzeigen' }).click()
  await expect(earmarks.getByRole('button')).toHaveCount(4)
  await expect(budgets.getByRole('button')).toHaveCount(3)
  await page.evaluate(() => { (window as any).failWrite = true })
  await table.getByRole('button', { name: 'Alpha: Aus der Seitenleiste entfernen' }).click()
  await expect(table.getByRole('alert')).toContainText('nicht gespeichert')
  await expect(earmarks.getByRole('button')).toHaveCount(4)
  await expect(table.getByRole('button', { name: 'Alpha: Aus der Seitenleiste entfernen' })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => { (window as any).failWrite = false })
  await table.getByRole('button', { name: 'Alpha: Aus der Seitenleiste entfernen' }).click()
  await expect(earmarks.getByRole('button')).toHaveCount(3)
  await expect(table.getByRole('alert')).toHaveCount(0)
})

test('organization switches discard stale selections and loading failures can be retried', async ({ page }) => {
  const table = page.getByRole('region', { name: 'Budgetentwicklung', exact: true })
  const sidebar = page.getByRole('group', { name: 'Aktuelle Budgets' })
  await expect(table.getByRole('button', { name: 'Alpha: In der Seitenleiste anzeigen' })).toBeEnabled()
  await page.evaluate(() => { (window as any).holdRead = true; window.dispatchEvent(new Event('data-changed:settings')) })
  await expect.poll(() => page.evaluate(() => (window as any).pending.length)).toBe(4)
  await page.evaluate(() => { const w = window as any; w.holdRead = false; w.switchOrg('b') })
  await expect(sidebar.locator('.sidebar-assignment-name')).toHaveText(['Alpha'])
  await expect(table.getByRole('button', { name: 'Alpha: Aus der Seitenleiste entfernen' })).toBeEnabled()
  await page.evaluate(() => (window as any).pending.forEach((resolve: () => void) => resolve()))
  await expect(sidebar.locator('.sidebar-assignment-name')).toHaveText(['Alpha'])
  await expect(page.getByRole('group', { name: 'Aktuelle Zweckbindungen' })).toHaveCount(0)
  await page.evaluate(() => { const w = window as any; w.failRead = true; window.dispatchEvent(new Event('data-changed:settings')) })
  await expect(table.getByRole('alert')).toContainText('nicht geladen')
  await expect(table.locator('.finance-pin').first()).toBeDisabled()
  await page.evaluate(() => { (window as any).failRead = false })
  await table.getByRole('button', { name: 'Auswahl erneut laden' }).click()
  await expect(table.getByRole('button', { name: 'Alpha: Aus der Seitenleiste entfernen' })).toBeEnabled()
  await expect(sidebar.locator('.sidebar-assignment-name')).toHaveText(['Alpha'])
})
