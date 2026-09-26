import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/booking/bookingTable.css', 'src/renderer/components/finance/financeOverview.css'].map(file => readFile(file, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { usePageHistory } from './src/renderer/hooks/usePageHistory'
    import JournalTable from './src/renderer/views/Journal/components/JournalTable'
    import BudgetsView from './src/renderer/views/Budgets/BudgetsView'
    import EarmarksView from './src/renderer/views/Earmarks/EarmarksView'
    const noop = () => {}
    window.api = {
      window: { onNavigationBackRequested: handler => { window.nativeBack = handler; return noop }, onNavigationForwardRequested: handler => { window.nativeForward = handler; return noop } },
      classifications: { primary: { list: async () => ({ profile: 'NONPROFIT', values: [] }) } },
      budgets: { list: async () => ({ rows: [{ id: 1, year: 2026, name: 'Jugend', amountPlanned: 2000, sphere: 'IDEELL', categoryName: 'Sport', projectName: 'Sommerfest', isArchived: 0 }, { id: 5, year: 2025, name: 'Altbudget', amountPlanned: 100, sphere: 'IDEELL', isArchived: 0 }] }), usage: async () => ({ spent: 500, inflow: 100, count: 2, monthly: [{ month: '2026-09', spent: 500, inflow: 100 }] }), upsert: async input => { window.archived = input; return { id: input.id } } },
      bindings: { list: async () => ({ rows: [{ id: 2, code: 'JUG', name: 'Jugendspenden', description: 'Für die Jugend', budget: 3000, isActive: 1 }] }), usage: async () => ({ allocated: 100, released: 500, budget: 3000, monthly: [] }), upsert: async input => { window.archived = input; return { id: input.id } } }
    }
    function Harness() {
      const [page, setPage] = useState('Start')
      const [sortBy, setSortBy] = useState('date')
      usePageHistory(page, setPage)
      return <><nav>{['Start', 'Budgets', 'Zweckbindungen', 'Buchungen'].map(name => <button key={name} onClick={() => setPage(name)}>{name}</button>)}</nav><h1 data-testid="page">{page}</h1>
        {page === 'Budgets' && <BudgetsView onGoToBookings={id => { window.bookingsId = id }} notify={noop} />}
        {page === 'Zweckbindungen' && <EarmarksView onGoToBookings={id => { window.bookingsId = id }} onLoadEarmarks={async () => {}} notify={noop} />}
        {page === 'Buchungen' && <JournalTable rows={[{ id: 4, voucherNo: '2026-04', date: '2026-09-24', type: 'OUT', sphere: 'IDEELL', description: 'Material Jugendgruppe', note: 'Rechnung bezahlt', counterparty: 'Sportbedarf', netAmount: 100, vatAmount: 19, grossAmount: 119, vatRate: 19, fileCount: 1, budgets: [{ budgetId: 1, label: 'Jugend', amount: 119 }], tags: ['Sommerfest'] }]} order={['date','description','gross']} cols={{ date: true, description: true, gross: true }} onReorder={noop} earmarks={[]} tagDefs={[]} eurFmt={new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })} fmtDate={s => s} onEdit={noop} onDelete={noop} onToggleSort={setSortBy} sortDir="DESC" sortBy={sortBy} onRowDoubleClick={() => { window.fullDetails = true }} />}
      </>
    }
    createRoot(document.getElementById('root')).render(<Harness />)
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://navigation.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root" style="padding:20px"></div></html>' }))
  await page.goto('http://navigation.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('mouse back/forward and native signals navigate once and new navigation discards forward history', async ({ page }) => {
  await page.getByRole('button', { name: 'Budgets', exact: true }).click()
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  const cdp = await page.context().newCDPSession(page)
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: 15, y: 15, button: 'back', clickCount: 1 })
  await expect(page.getByTestId('page')).toHaveText('Budgets')
  await page.evaluate(() => (window as any).nativeBack())
  await expect(page.getByTestId('page')).toHaveText('Budgets')
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: 15, y: 15, button: 'forward', clickCount: 1 })
  await expect(page.getByTestId('page')).toHaveText('Buchungen')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.getByTestId('page')).toHaveText('Budgets')
  await page.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(page.getByTestId('page')).toHaveText('Zweckbindungen')
})

test('single budget overview keeps metadata and archive action', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Budgets', exact: true }).click()
  await expect(page.locator('table')).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Darstellung der Budgetübersicht' })).toHaveCount(0)
  const names = page.locator('.finance-table > tbody > tr > th[scope="row"]')
  await expect(names).toHaveText(['Jugend', 'Altbudget'])
  await page.getByRole('columnheader', { name: /Name/ }).getByRole('button').click()
  await expect(names).toHaveText(['Altbudget', 'Jugend'])
  await page.getByRole('columnheader', { name: /Name/ }).getByRole('button').click()
  await expect(names).toHaveText(['Jugend', 'Altbudget'])
  await page.getByRole('columnheader', { name: /Jahr/ }).getByRole('button').click()
  await expect(names).toHaveText(['Altbudget', 'Jugend'])
  await page.getByRole('button', { name: 'Jugend: Details anzeigen' }).click()
  await expect(page.getByText('Kategorie: Sport · Projekt: Sommerfest')).toBeVisible()
  await page.getByRole('button', { name: 'Buchungen ansehen' }).click()
  expect(await page.evaluate(() => (window as any).bookingsId)).toBe(1)
  await page.screenshot({ path: info.outputPath('budget-single-overview.png'), fullPage: true })
  await page.getByRole('button', { name: 'Archivieren', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archivieren', exact: true }).click()
  expect(await page.evaluate(() => (window as any).archived.isArchived)).toBe(true)
  await page.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await expect(page.locator('table')).toHaveCount(1)
  await expect(page.getByRole('columnheader', { name: /Code/ }).getByRole('button')).toBeVisible()
  await page.getByRole('button', { name: 'Jugendspenden: Details anzeigen' }).click()
  await expect(page.getByText('Für die Jugend', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archivieren', exact: true })).toBeVisible()
})

test('journal expands with keyboard, sorts, and remembers compact density', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  const expand = page.getByRole('button', { name: '2026-04: Details anzeigen' })
  await expand.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Buchungsdetails 2026-04' })).toContainText('Rechnung bezahlt')
  await page.getByRole('button', { name: 'Vollständige Buchungsinfo' }).click()
  expect(await page.evaluate(() => (window as any).fullDetails)).toBe(true)
  await page.getByRole('columnheader', { name: /Brutto/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: /Brutto/ })).toHaveAttribute('aria-sort', 'descending')
  await page.getByRole('button', { name: 'Kompakt', exact: true }).click()
  await page.screenshot({ path: info.outputPath('journal-details.png'), fullPage: true })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Kompakt', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
