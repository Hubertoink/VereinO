import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/views/BankImport/bankReview.css', 'src/renderer/styles.css'].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import BankImportView, { BankReviewModal } from './src/renderer/views/BankImport/BankImportView'
      const root = createRoot(document.getElementById('root'))
      const account = { id: 1, name: 'Bank', kind: 'BANK', isActive: 1 }
      const transaction = { id: 77, bookingDate: '2026-03-31', direction: 'OUT', amount: 4.9, currency: 'EUR',
        purpose: 'Abschluss per 31.03.2026', status: 'OPEN', paymentAccountId: 1, paymentAccountName: 'Bank', sourceFileName: 'export.csv' }
      const notify = (...args) => window.notices.push(args)
      window.renderBankTest = (kind, options = {}) => {
        window.creations = []; window.notices = []; window.closeCalls = 0
        const current = { ...transaction, ...options.transaction }
        const rows = [current, { ...transaction, id: 78, purpose: 'Weitere Zahlung' }]
        window.api = { bankTransactions: {
          matches: async () => {
            if (options.hold) await new Promise(resolve => { window.finishMatches = resolve })
            if (options.fail) throw new Error('Prüfung nicht verfügbar')
            return { rows: [], alreadyLinked: options.duplicate ? [{ id: 12, voucherNo: '2026-12', date: '2026-03-31', grossAmount: 4.9, linkedBankTransactionId: 70, description: 'Bereits gebucht' }] : [] }
          },
          list: async () => ({ rows, total: 2, stats: { total: 2, open: 2, checked: 0, linked: 0 } }),
          importStatus: async () => ({ total: 2, lastBookingDate: null, accounts: [], recentImports: [] })
        } }
        const onCreateBooking = (row, acknowledgements) => window.creations.push({ id: row.id, acknowledgements })
        root.render(kind === 'review'
          ? <BankReviewModal transaction={current} onClose={() => { window.closeCalls++ }} onChanged={() => {}} onCreateBooking={onCreateBooking} onCheckWithoutBooking={() => {}} onOpenVoucher={() => {}} notify={notify} />
          : <BankImportView paymentAccounts={[account]} notify={notify} onCreateBooking={onCreateBooking} onOpenVoucher={() => {}} />)
      }
    ` },
    bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'expose-bank-review', setup(builder) {
      builder.onLoad({ filter: /BankImportView\.tsx$/ }, async ({ path }) => ({ contents: await fs.readFile(path, 'utf8') + '\nexport { BankReviewModal }', loader: 'tsx' }))
    } }]
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://bank.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><main class="app-main" style="height:100vh;box-sizing:border-box"><div id="root"></div></main></html>' }))
  await page.goto('http://bank.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' })
  await page.addScriptTag({ content: script })
})

test('create booking is beside close after checking and uses the existing callback', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.evaluate(() => (window as any).renderBankTest('review'))
  const footer = page.locator('.bank-review-modal > .bank-modal-footer')
  const create = footer.getByRole('button', { name: 'Buchung anlegen', exact: true })
  await expect(create).toBeEnabled()
  const closeBounds = await footer.getByRole('button', { name: 'Schließen', exact: true }).boundingBox()
  const createBounds = await create.boundingBox()
  expect(createBounds!.x).toBeGreaterThan(closeBounds!.x)
  expect(Math.abs(createBounds!.y - closeBounds!.y)).toBeLessThan(2)
  await page.screenshot({ path: testInfo.outputPath('review-footer.png') })
  await create.click()
  expect(await page.evaluate(() => (window as any).creations)).toEqual([{ id: 77, acknowledgements: [] }])
  expect(await page.evaluate(() => (window as any).closeCalls)).toBe(1)
})

test('duplicate keeps creation out of footer and preserves the reviewed menu action', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBankTest('review', { duplicate: true }))
  await expect(page.getByRole('region', { name: 'Mögliche Doppelbuchung' })).toBeVisible()
  const footer = page.locator('.bank-review-modal > .bank-modal-footer')
  await expect(footer.getByRole('button', { name: 'Buchung anlegen', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Buchung anlegen', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click()
  await page.getByText('Es ist ein zusätzlicher Umsatz', { exact: true }).click()
  await page.getByRole('checkbox', { name: /Ich habe die Zuordnungen geprüft/ }).check()
  await expect(footer.getByRole('button', { name: 'Buchung anlegen', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click()
  await page.getByRole('button', { name: 'Buchung anlegen', exact: true }).click()
  expect(await page.evaluate(() => (window as any).creations)).toEqual([{ id: 77, acknowledgements: [12] }])
})

test('pending or failed duplicate check never exposes the footer shortcut', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBankTest('review', { hold: true, fail: true }))
  await expect(page.locator('.bank-review-modal')).toBeVisible()
  const create = page.locator('.bank-review-modal > .bank-modal-footer').getByRole('button', { name: 'Buchung anlegen', exact: true })
  await expect(create).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishMatches)).toBe('function')
  await page.evaluate(() => (window as any).finishMatches())
  await expect.poll(() => page.evaluate(() => (window as any).notices.length)).toBe(1)
  await expect(create).toHaveCount(0)
})

test('long expanded details preserve every column and wrap within the table', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate(() => (window as any).renderBankTest('list', { transaction: {
    purpose: 'JUGENDHERBERGE ST. GOAR FREIZEIT ' + '0940604549291705011674099'.repeat(12),
    bankReference: 'REFERENZ'.repeat(40), sourceFileName: 'Umsaetze_' + '20260924'.repeat(30) + '.csv',
    aiSuggestion: { reason: 'Verwendungszweck'.repeat(40) }
  } }))
  const table = page.getByRole('table', { name: 'Importierte Bankbelege' })
  await expect(page.getByRole('button', { name: 'Bankbeleg 77: Details anzeigen', exact: true })).toBeVisible()
  const geometry = () => table.locator('thead th').evaluateAll(cells => cells.map(cell => ({ x: cell.getBoundingClientRect().x, width: cell.getBoundingClientRect().width })))
  for (const width of [1280, 1000]) {
    await page.setViewportSize({ width, height: 900 })
    const before = await geometry()
    await page.getByRole('button', { name: 'Bankbeleg 77: Details anzeigen', exact: true }).click()
    await expect(page.locator('#bank-inline-77')).toBeVisible()
    const after = await geometry()
    after.forEach((cell, index) => {
      expect(Math.abs(cell.x - before[index].x)).toBeLessThan(1)
      expect(Math.abs(cell.width - before[index].width)).toBeLessThan(1)
    })
    expect(await page.locator('.bank-inline-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    expect(await page.locator('.bank-inline-facts dd').first().evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`expanded-${width}.png`) })
    await page.getByRole('button', { name: 'Bankbeleg 77: Details schließen', exact: true }).click()
    const collapsed = await geometry()
    collapsed.forEach((cell, index) => expect(Math.abs(cell.width - before[index].width)).toBeLessThan(1))
  }
})
