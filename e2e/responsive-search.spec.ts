import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8')
  script = (await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useRef, useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import RecurringBookingsView from './src/renderer/views/RecurringBookings/RecurringBookingsView'
      import BudgetsView from './src/renderer/views/Budgets/BudgetsView'
      import ResponsiveSearch from './src/renderer/components/common/ResponsiveSearch'
      window.requests = []
      const rows = [
        { id: 1, name: 'Vereinssoftware', type: 'OUT', amount: 24, frequency: 'MONTHLY', nextDueDate: '2026-12-01', status: 'ACTIVE', dueCount: 0, paymentAccountName: 'Vereinsbank' },
        { id: 2, name: 'Versicherung für das Vereinsheim mit einer langen Bezeichnung', type: 'OUT', amount: 500, frequency: 'YEARLY', nextDueDate: '2027-01-01', status: 'PAUSED', dueCount: 0, paymentAccountName: 'Vereinsbank' }
      ]
      const empty = async () => ({ rows: [] })
      window.api = {
        recurringBookings: { list: async input => { window.requests.push(input); return { rows: rows.filter(row => (!input.q || row.name.toLowerCase().includes(input.q.toLowerCase())) && (!input.status || input.status === row.status)) } }, summary: async () => ({ due: 0, upcoming: 1, active: 1, paused: 1 }) },
        paymentAccounts: { list: empty }, budgets: { list: empty }, bindings: { list: empty }, tags: { list: empty }
      }
      function ShortcutSearch() {
        const [value, setValue] = useState('Vereinssoftware')
        const ref = useRef(null)
        return <><button onClick={() => { ref.current.focus(); ref.current.select() }}>Suchkürzel</button><ResponsiveSearch ref={ref} label="Suche" value={value} onChange={setValue} /></>
      }
      const root = createRoot(document.getElementById('root'))
      window.mount = view => root.render(view === 'budgets' ? <BudgetsView notify={() => {}} onGoToBookings={() => {}} /> : view === 'shortcut' ? <ShortcutSearch /> : <RecurringBookingsView notify={() => {}} />)
      window.mount('recurring')
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://search.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div class="test-shell"><aside>Navigation</aside><main class="app-main" id="root"></main></div></html>' }))
  await page.goto('http://search.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '.test-shell { display: flex; width: 100%; } .test-shell > aside { flex: 0 0 258px; padding: 16px; box-sizing: border-box; } .test-shell > .app-main { flex: 1; min-width: 0; margin: 0; } @media(max-width: 700px) { .test-shell > aside { display: none; } }' })
  await page.addScriptTag({ content: script })
  await expect(page.getByText('Vereinssoftware', { exact: true })).toBeVisible()
})

async function expectFits(page: Page) {
  const overflow = await page.locator('.app-main, .recurring-bookings-view, .recurring-overview-row, .recurring-page-tools').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className))
  expect(overflow).toEqual([])
}

test('recurring toolbar stays inside the page with separate search and filter controls', async ({ page }, info) => {
  for (const width of [1600, 1280, 1180, 1101, 1075, 960, 640, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await expectFits(page)
    await expect(page.getByRole('button', { name: 'Dauerbuchung', exact: true })).toBeInViewport()
    const tools = page.locator('.recurring-page-tools')
    const search = tools.locator('.responsive-search')
    const filter = tools.getByRole('button', { name: 'Status filtern', exact: true })
    const a = (await search.boundingBox())!
    const b = (await filter.boundingBox())!
    expect(b.x >= a.x + a.width || b.y >= a.y + a.height).toBeTruthy()
    if (width === 1075 || width === 390) await page.screenshot({ path: info.outputPath(`recurring-${width}.png`) })
  }
})

test('compact search opens focused, keeps its filter and survives resizing', async ({ page }, info) => {
  await page.setViewportSize({ width: 1075, height: 800 })
  const trigger = page.getByRole('button', { name: 'Dauerbuchungen durchsuchen', exact: true })
  await expect(page.getByRole('textbox', { name: 'Dauerbuchungen durchsuchen' })).toHaveCount(0)
  await trigger.click()
  const field = page.getByRole('textbox', { name: 'Dauerbuchungen durchsuchen' })
  await expect(field).toBeFocused()
  await field.fill('software')
  await expect(page.locator('.recurring-table tbody tr')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('recurring-search-open.png') })
  await field.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveClass(/has-filters/)
  await trigger.click()
  await expect(field).toHaveValue('software')
  await page.getByRole('heading', { name: 'Dauerbuchungen', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.setViewportSize({ width: 1600, height: 800 })
  await expect(field).toHaveValue('software')
  await page.getByRole('button', { name: 'Suche leeren' }).click()
  await expect(page.locator('.recurring-table tbody tr')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 800 })
  await trigger.click()
  const panel = page.getByRole('dialog', { name: 'Dauerbuchungen durchsuchen' })
  const box = (await panel.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await field.fill('Versicherung')
  await field.press('Enter')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.recurring-table tbody tr')).toHaveCount(1)
})

test('budgets use the same compact search and keyboard shortcuts can open it', async ({ page }) => {
  await page.setViewportSize({ width: 1075, height: 800 })
  await page.evaluate(() => (window as any).mount('budgets'))
  await page.getByRole('button', { name: 'Budgets durchsuchen', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Budgets durchsuchen' })).toBeFocused()
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window as any).mount('shortcut'))
  await page.getByRole('button', { name: 'Suchkürzel' }).click()
  const field = page.getByRole('textbox', { name: 'Suche', exact: true })
  await expect(field).toBeFocused()
  expect(await field.evaluate((node: HTMLInputElement) => node.selectionEnd! - node.selectionStart!)).toBe('Vereinssoftware'.length)
})
