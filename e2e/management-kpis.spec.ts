import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/finance/managementKpis.css', 'src/renderer/views/invoicesShared/invoiceDetail.css', 'src/renderer/views/reimbursements/reimbursements.css'].map(f => fs.readFile(f, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import MembersView from './src/renderer/views/Mitglieder/MembersView'
    import InvoicesView from './src/renderer/views/InvoicesView'
    window.requests = []
    window.memberAmount = 95
    window.api = {
      members: { list: async input => { window.requests.push(input); return { rows: [{ id: 1, name: 'Erika Muster', memberNo: '0001', status: 'ACTIVE', email: 'erika@example.org', contribution_amount: 10, contribution_interval: 'MONTHLY' }], total: 45, summary: input.includeSummary ? { active: 42, dueMembers: 2, dueAmount: window.memberAmount } : undefined } } },
      payments: { status: async () => ({ hasPlan: 1, state: 'OVERDUE', overdue: 2 }) },
      budgets: { list: async () => ({ rows: [{ id: 1, name: 'Jugendarbeit', year: 2026 }] }) },
      reimbursements: { list: async () => [
        { id: 1, title: 'Renovierung', partner: 'Partner A', dueDate: '2026-09-10', expectedCents: 20000, paidCents: 5000, remainingCents: 15000, status: 'PARTIAL' },
        { id: 2, title: 'Material', partner: 'Partner B', dueDate: null, expectedCents: 1000, paidCents: 1000, remainingCents: 0, status: 'PAID' }
      ] },
      invoiceFiles: { open: async () => { window.fileOpened = true; return { ok: true } } },
      invoices: { get: async () => ({ id: 1, date: '2026-09-01', dueDate: '2026-09-10', party: 'Bürobedarf Muster', description: 'Material für die Jugendarbeit', invoiceNo: 'R-12', voucherType: 'OUT', grossAmount: 200, paidSum: 50, status: 'PARTIAL', sphere: 'IDEELL', budgets: [{ budgetId: 1, amount: 200 }], earmarks: [], payments: [{ id: 1, date: '2026-09-05', amount: 50 }], files: [{ id: 1, fileName: 'Eine sehr lange Rechnung für Material.pdf', size: 25000, createdAt: '2026-09-01 12:00:00' }], tags: [] }), list: async () => ({ total: 40, rows: [{ id: 1, date: '2026-09-01', dueDate: '2026-09-10', party: 'Bürobedarf Muster', invoiceNo: 'R-12', voucherType: 'OUT', grossAmount: 200, paidSum: 50, status: 'PARTIAL', sphere: 'IDEELL' }, { id: 2, date: '2026-09-01', dueDate: '2026-09-10', party: 'Bezahlte Rechnung', voucherType: 'IN', grossAmount: 100, paidSum: 100, status: 'PAID', sphere: 'IDEELL' }] }), summary: async () => ({ count: 40, gross: 1000, paid: 700, remaining: 300, remainingIn: 110, remainingOut: 190, overdueAmount: 150, overdueCount: 1 }) }
    }
    const root = createRoot(document.getElementById('root'))
    window.mount = view => root.render(view === 'members' ? <MembersView /> : <InvoicesView />)
    window.mount('members')
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', external: ['pdfjs-dist/*'], loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'toast', setup(build) {
    build.onResolve({ filter: /\/(LocalInvoiceScanModal|InvoiceBatchControl|MembersExportModal)$/ }, args => ({ path: args.path, namespace: 'unused-modal' }))
    build.onLoad({ filter: /.*/, namespace: 'unused-modal' }, () => ({ contents: 'export default function Modal() { return null }', loader: 'js' }))
    build.onResolve({ filter: /\/context\/useToast$/ }, args => ({ path: args.path, namespace: 'mock-toast' }))
    build.onLoad({ filter: /.*/, namespace: 'mock-toast' }, () => ({ contents: 'export const useToast = () => ({ notify: () => {} })', loader: 'js' }))
  } }] })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://management.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://management.test/')
  await page.setViewportSize({ width: 1500, height: 950 })
  await page.addStyleTag({ content: css })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addScriptTag({ content: script })
  expect(errors).toEqual([])
})

test('members show whole-selection KPIs, readable status and contribution interval and refresh after payment', async ({ page }, info) => {
  const overview = page.getByRole('region', { name: 'Mitgliederübersicht' })
  await expect(overview).toContainText('42')
  await expect(overview).toContainText('95,00')
  await expect(page.locator('.management-status')).toHaveText('Aktiv')
  await expect(page.locator('.management-contribution-interval')).toHaveText('pro Monat')
  await page.evaluate(() => { (window as any).memberAmount = 75; window.dispatchEvent(new Event('data-changed:members')) })
  await expect(overview).toContainText('75,00')
  await page.screenshot({ path: info.outputPath('members-kpis.png'), fullPage: true })
})

test('invoices separate open directions and show progress and overdue hints only on unpaid rows', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  const overview = page.getByRole('region', { name: 'Verbindlichkeitenübersicht' })
  await expect(overview).toContainText('190,00')
  await expect(overview).toContainText('110,00')
  await expect(overview).toContainText('150,00')
  const partial = page.getByRole('row').filter({ hasText: 'Bürobedarf Muster' })
  await expect(partial).toContainText('Teilbezahlt')
  await expect(partial).toContainText('25 % bezahlt')
  await expect(partial).toContainText('überfällig')
  await expect(page.getByRole('row').filter({ hasText: 'Bezahlte Rechnung' }).locator('.management-due')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('invoice-kpis.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await overview.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})


test('reimbursements show filtered amounts and reimbursement progress', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  await page.getByRole('button', { name: 'Kostenerstattungen', exact: true }).click()
  const title = await page.getByRole('heading', { name: 'Kostenerstattungen', exact: true }).boundingBox()
  const search = await page.getByRole('textbox', { name: 'Kostenerstattungen suchen' }).boundingBox()
  expect(Math.abs((title!.y + title!.height / 2) - (search!.y + search!.height / 2))).toBeLessThan(4)
  const kpis = page.getByRole('region', { name: 'Kostenerstattungsübersicht' })
  await expect(kpis).toContainText('150,00')
  await expect(kpis).toContainText('60,00')
  await expect(page.getByRole('row').filter({ hasText: 'Renovierung' })).toContainText('25 % erstattet')
  await page.getByRole('combobox', { name: 'Status filtern' }).selectOption('PAID')
  await expect(kpis).toContainText('10,00')
  await expect(kpis).not.toContainText('150,00')
  await page.getByRole('combobox', { name: 'Status filtern' }).selectOption('ALL')
  await page.screenshot({ path: info.outputPath('reimbursements-kpis.png'), fullPage: true })
})

test('invoice details prioritize payment figures and disclose named assignments and file actions', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  await page.getByRole('row').filter({ hasText: 'Bürobedarf Muster' }).dblclick()
  const modal = page.getByRole('dialog', { name: 'Rechnungsdetails' })
  await expect(modal.getByRole('region', { name: 'Zahlungsübersicht' })).toContainText('150,00')
  await expect(modal.locator('details')).toHaveCount(0)
  expect(await modal.getByRole('cell', { name: '200,00 €', exact: true }).evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(60)
  await page.screenshot({ path: info.outputPath('invoice-detail-cards.png'), fullPage: true, animations: 'disabled' })
  await expect(modal.getByRole('cell', { name: 'Jugendarbeit', exact: true })).toBeVisible()
  await expect(modal.getByText('Eine sehr lange Rechnung für Material.pdf')).toBeVisible()
  const payments = await modal.getByRole('region', { name: 'Zahlungen', exact: true }).boundingBox()
  const files = await modal.getByRole('region', { name: 'Anhänge', exact: true }).boundingBox()
  expect(files!.y).toBeCloseTo(payments!.y, 0)
  expect(files!.x).toBeGreaterThan(payments!.x)
  await modal.getByRole('button', { name: 'Eine sehr lange Rechnung für Material.pdf' }).click()
  expect(await page.evaluate(() => (window as any).fileOpened)).toBe(true)
  await page.setViewportSize({ width: 500, height: 900 })
  expect(await modal.locator('.invoice-detail-refined').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
})
