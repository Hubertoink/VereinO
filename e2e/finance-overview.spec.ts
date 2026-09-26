import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/views/DashboardPlus/dashboardPlus.css', 'src/renderer/components/finance/financeOverview.css', 'src/renderer/views/BankImport/bankReview.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import DashboardInsights from './src/renderer/views/DashboardPlus/DashboardInsights'
    import FinanceKpiTable from './src/renderer/components/finance/FinanceKpiTable'
    import BankImportView from './src/renderer/views/BankImport/BankImportView'
    const noop = () => {}
    const budgets = [{ id: 1, year: 2026, name: 'Jugendförderung', amountPlanned: 1000, sphere: 'IDEELL', color: '#16a5a8' }, { id: 2, year: 2026, name: 'Sommerfest', amountPlanned: 1000, sphere: 'IDEELL', color: '#ad77c3' }]
    const months = [{ month: '2026-07', inflow: 100, spent: 300 }, { month: '2026-08', inflow: 0, spent: 1050 }]
    window.calls = []
    window.api = {
      reports: { summary: async () => ({ classificationProfile: 'NONPROFIT', totals: { gross: 1250 }, bySphere: [{ key: 'IDEELL', gross: 950 }, { key: 'ZWECK', gross: 300 }] }) },
      budgets: { list: async () => ({ rows: budgets }), usage: async input => { window.calls.push(input); if (window.failUsage) throw Error('offline'); return { planned: 1000, inflow: 100, spent: 1350, monthly: months, count: 3, countOutside: 1 } } },
      bindings: { list: async () => ({ rows: [{ id: 3, code: 'JUG', name: 'Jugendspenden', budget: 2000, isActive: 1 }] }), usage: async () => ({ allocated: 100, released: 1350, monthly: months, budget: 2000 }) },
      bankTransactions: { list: async input => { window.bankFilter = input; return { rows: [{ id: 8, bookingDate: '2026-09-24', direction: 'OUT', amount: 79, status: 'LINKED', currency: 'EUR', counterparty: 'Sportbedarf Müller', purpose: 'Ausstattung Jugendgruppe und Material für das Sommerfest', counterpartyIban: 'DE001234', paymentAccountId: 1, paymentAccountName: 'Vereinskonto', sourceFileName: 'September.csv', voucherId: 22, voucherNo: '2026-22' }], stats: { total: 1, open: 0, linked: 1, checked: 0 }, total: 1 } }, importStatus: async () => ({ total: 0 }) }
    }
    const root = createRoot(document.getElementById('root'))
    window.mount = mode => root.render(mode === 'bank' ? <BankImportView paymentAccounts={[]} notify={noop} onCreateBooking={noop} onOpenVoucher={id => { window.openedVoucher = id }} /> : <div className="dashboard-plus"><FinanceKpiTable today="2026-09-26" months={[{ month: '2026-07', income: 100, expense: 300, net: -200, balance: -200 }, { month: '2026-08', income: 0, expense: 1050, net: -1050, balance: -1250 }, { month: '2026-09', income: 99999, expense: 0, net: 99999, balance: 98749 }]} /><DashboardInsights from="2026-07-01" to="2026-09-26" revision={0} onBudgets={noop} onBindings={noop} /></div>)
    window.mount('dashboard')
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://finance.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://finance.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('desktop dashboard stacks distribution and overview; trends expose exact values', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.getByText('125 % · Plan überschritten')).toHaveCount(2)
  const distribution = await page.locator('.dp-distribution').boundingBox()
  const overview = await page.locator('.dp-budget-overview').boundingBox()
  expect(overview!.y).toBeGreaterThanOrEqual(distribution!.y + distribution!.height)
  expect(overview!.width).toBeCloseTo(distribution!.width, 0)
  expect(distribution!.height).toBeLessThan(400)
  await page.getByRole('button', { name: 'Jugendförderung: Details anzeigen' }).click()
  await expect(page.getByRole('table', { name: /Monatswerte/ })).toContainText('1.050,00')
  await expect(page.getByText('1 Buchung(en) außerhalb', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Finanzkennzahlen' })).not.toContainText('99.999')
  await page.screenshot({ path: info.outputPath('dashboard-finance-light.png'), fullPage: true })
  await page.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await expect(page.getByText('Jugendspenden', { exact: true })).toBeVisible()
})

test('failed finance requests show unavailable values and can be retried', async ({ page }) => {
  await expect(page.getByText('Jugendförderung', { exact: true })).toBeVisible()
  await page.evaluate(() => { (window as any).failUsage = true; (window as any).mount('bank') })
  await expect(page.getByRole('heading', { name: 'Bankimport' })).toBeVisible()
  await page.evaluate(() => (window as any).mount('dashboard'))
  await expect(page.getByText('Nicht verfügbar', { exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: 'Jugendförderung: Details anzeigen' }).click()
  await expect(page.getByRole('alert')).toContainText('nicht geladen')
  await page.evaluate(() => { (window as any).failUsage = false })
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click()
  await expect(page.getByText('125 % · Plan überschritten')).toHaveCount(2)
})

test('bank details are keyboard accessible and retain voucher navigation and sorting', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('bank'))
  const expand = page.getByRole('button', { name: 'Bankbeleg 8: Details anzeigen' })
  await expand.focus(); await page.keyboard.press('Enter')
  await expect(page.getByText('Gegenpartei / IBAN')).toBeVisible()
  await expect(page.getByText('DE001234', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '2026-22', exact: true }).click()
  expect(await page.evaluate(() => (window as any).openedVoucher)).toBe(22)
  await page.getByRole('button', { name: /Summe/ }).click()
  await expect.poll(() => page.evaluate(() => (window as any).bankFilter.sortBy)).toBe('amount')
  await page.screenshot({ path: info.outputPath('bank-detail.png'), fullPage: true })
  await page.getByRole('button', { name: 'Bankbeleg 8: Details schließen' }).click()
  await expect(page.getByText('Gegenpartei / IBAN')).toHaveCount(0)
})

test('narrow dark dashboard contains table overflow within its panels', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await expect(page.getByText('125 % · Plan überschritten')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('dashboard-finance-dark-mobile.png'), fullPage: true })
})
