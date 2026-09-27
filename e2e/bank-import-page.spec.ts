import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string

test.beforeAll(async () => {
  css = (await Promise.all([
    'src/renderer/styles.css',
    'src/renderer/views/BankImport/bankReview.css',
    'src/renderer/views/BankImport/bankImportDialog.css',
    'src/renderer/views/BankImport/bankImportPage.css',
    'src/renderer/views/BankImport/bankImportRemap.css'
  ].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import BankImportView from './src/renderer/views/BankImport/BankImportView'
      const accounts = [
        { id: 1, name: 'Vereinskonto', kind: 'BANK', isActive: 1 },
        { id: 2, name: 'Zweites Konto', kind: 'BANK', isActive: 1 }
      ]
      let rows = [
        { id: 1, batchId: 1, paymentAccountId: 1, paymentAccountName: 'Vereinskonto', bookingDate: '2026-09-01', status: 'OPEN', direction: 'IN', amount: 120, counterparty: 'Mitglied A', purpose: 'Beitrag', sourceFileName: 'export-1.csv' },
        { id: 2, batchId: 1, paymentAccountId: 1, paymentAccountName: 'Vereinskonto', bookingDate: '2026-09-02', status: 'LINKED', direction: 'OUT', amount: 20, counterparty: 'Porto', purpose: 'Porto', sourceFileName: 'export-1.csv' },
        { id: 3, batchId: 2, paymentAccountId: 1, paymentAccountName: 'Vereinskonto', bookingDate: '2026-08-01', status: 'OPEN', direction: 'IN', amount: 50, counterparty: 'Mitglied B', purpose: 'Beitrag', sourceFileName: 'export-2.csv' },
        { id: 4, batchId: 13, paymentAccountId: 2, paymentAccountName: 'Zweites Konto', bookingDate: '2026-09-03', status: 'OPEN', direction: 'OUT', amount: 10, counterparty: 'Kauf', purpose: 'Material', sourceFileName: 'export-13.csv' }
      ]
      const batches = Array.from({ length: 13 }, (_, i) => ({
        id: i + 1, fileName: 'export-' + (i + 1) + '.csv', format: 'CSV',
        paymentAccountId: i === 12 ? 2 : 1,
        paymentAccountName: i === 12 ? 'Zweites Konto' : 'Vereinskonto',
        imported: i === 11 || i === 10 ? 0 : 1, duplicates: i === 11 || i === 10 ? 34 : 0, errors: 0,
        importedAt: '2026-09-' + String(i + 1).padStart(2, '0') + ' 12:00:00',
        periodFrom: i === 11 || i === 10 ? null : '2026-09-01', periodTo: i === 11 || i === 10 ? null : '2026-09-02'
      })).sort((a, b) => b.id - a.id)
      window.listCalls = []
      window.historyCalls = []
      window.remapApplies = []
      window.api = {
        ai: { settings: { get: async () => ({ hasApiKey: false }) } },
        bankTransactions: {
          list: async input => {
            window.listCalls.push(input)
            const scoped = rows.filter(row =>
              (!input.paymentAccountId || row.paymentAccountId === input.paymentAccountId) &&
              (!input.batchId || row.batchId === input.batchId) &&
              (!input.from || row.bookingDate >= input.from) &&
              (!input.to || row.bookingDate <= input.to) &&
              (!input.q || (row.counterparty + ' ' + row.purpose).toLowerCase().includes(input.q.toLowerCase()))
            )
            const visible = scoped.filter(row => input.status === 'ALL' || row.status === input.status)
            return { rows: visible, total: visible.length, stats: {
              total: scoped.length, open: scoped.filter(row => row.status === 'OPEN').length,
              linked: scoped.filter(row => row.status === 'LINKED').length,
              checked: scoped.filter(row => row.status === 'CHECKED').length
            } }
          },
          importStatus: async () => ({ lastBookingDate: '2026-09-03', total: rows.length, recentImports: [], accounts: [
            { id: 1, name: 'Vereinskonto', lastImportAt: '2026-09-10 12:00:00', lastBookingDate: '2026-09-02', lastImportImportedCount: 1, total: 3 },
            { id: 2, name: 'Zweites Konto', lastImportAt: '2026-09-13 12:00:00', lastBookingDate: '2026-09-03', lastImportImportedCount: 1, total: 1 }
          ] }),
          importHistory: async input => {
            window.historyCalls.push(input)
            const scoped = batches.filter(batch => !input.paymentAccountId || batch.paymentAccountId === input.paymentAccountId)
            return { rows: scoped.slice((input.page - 1) * input.limit, input.page * input.limit), total: scoped.length, page: input.page, limit: input.limit }
          }
        },
        bankImports: {
          remapPreview: async input => ({ id: input.batchId, fileName: 'export-' + input.batchId + '.csv', format: 'CSV', paymentAccountName: 'Vereinskonto',
            headers: ['Name Zahlungsbeteiligter', 'Verwendungszweck'],
            suggestedMapping: { counterparty: 'Name Zahlungsbeteiligter' },
            mapping: input.mapping || { counterparty: 'Name Zahlungsbeteiligter' }, totalRows: 1, changeCount: 1,
            rows: [{ id: 3, bookingDate: '2026-08-01', direction: 'IN', amount: 50, changed: true,
              current: { counterparty: null, counterpartyIban: null, purpose: 'Beitrag', reference: null, endToEndId: null },
              proposed: { counterparty: 'Mitglied B', counterpartyIban: null, purpose: 'Beitrag', reference: null, endToEndId: null } }] }),
          remapApply: async input => { window.remapApplies.push(input); return { updated: 1, totalRows: 1 } },
          preview: async input => ({ format: 'CSV', headers: ['Buchungstag', 'Betrag', 'Verwendungszweck', 'Name Zahlungsbeteiligter'],
            suggestedMapping: { bookingDate: 'Buchungstag', amount: 'Betrag', purpose: 'Verwendungszweck', counterparty: 'Name Zahlungsbeteiligter' },
            accountIbans: [], detectedPaymentAccountId: input.paymentAccountId, warnings: [],
            rows: [{ sourceRow: 2, bookingDate: '2026-09-25', direction: 'IN', amount: 80, currency: 'EUR', purpose: 'Neue Spende', counterparty: 'Spender', errors: [] }],
            summary: { total: 1, valid: 1, errors: 0 }, duplicateRows: [] }),
          commit: async input => {
            rows = [...rows, { id: 21, batchId: 21, paymentAccountId: input.paymentAccountId,
              paymentAccountName: 'Vereinskonto', bookingDate: '2026-09-25', status: 'OPEN', direction: 'IN',
              amount: 80, counterparty: 'Spender', purpose: 'Neue Spende', sourceFileName: input.fileName }]
            return { batchId: 21, imported: 1, importedTransactionIds: [21], duplicates: 0, duplicateRows: [], errors: [] }
          }
        }
      }
      createRoot(document.getElementById('root')).render(<BankImportView paymentAccounts={accounts} notify={() => {}} onCreateBooking={() => {}} onOpenVoucher={() => {}} />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://bank-page.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://bank-page.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('visible account and date controls scope the status counts and list', async ({ page }, info) => {
  await expect(page.getByRole('button', { name: 'Offen 3' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await expect(page.getByRole('button', { name: 'Gesamt 3' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Offen 2' })).toBeVisible()
  await expect(page.getByText(/Letzter Import mit Buchungen:.*10\.09\.26/)).toBeVisible()
  await expect(page.getByText('Neuester erfasster Umsatz: 2.9.2026')).toBeVisible()
  await page.getByLabel('Von', { exact: true }).fill('2026-09-01')
  await expect(page.getByRole('button', { name: 'Gesamt 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Offen 1' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).listCalls.at(-1)?.from)).toBe('2026-09-01')
  await page.getByLabel('Bis', { exact: true }).fill('2026-09-01')
  await expect(page.getByRole('button', { name: 'Gesamt 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zugeordnet 0' })).toBeVisible()
  await page.getByLabel('Bis', { exact: true }).fill('')
  await expect(page.getByRole('button', { name: 'Gesamt 2' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('bank-account-date-filter.png'), fullPage: true })
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('2')
  await expect(page.getByRole('button', { name: 'Gesamt 1' })).toBeVisible()
  await expect(page.getByText('Neuester erfasster Umsatz: 3.9.2026')).toBeVisible()
})

test('account history reaches older pages and opens the chosen import batch', async ({ page }, info) => {
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await page.getByRole('button', { name: 'Importhistorie' }).click()
  const history = page.getByRole('dialog', { name: 'Importhistorie' })
  await expect(history).toContainText('12 Vorgänge')
  await expect(history).toContainText('Seite 1 / 2')
  for (const fileName of ['export-12.csv', 'export-11.csv']) {
    const duplicateOnlyImport = history.locator('.bank-import-history-entry').filter({ hasText: fileName })
    await expect(duplicateOnlyImport).toContainText('Keine neuen Buchungen')
    await expect(duplicateOnlyImport.getByRole('button', { name: /Aktionen für/ })).toHaveCount(0)
  }
  await expect(history.locator('.bank-import-history-entry').filter({ hasText: 'export-10.csv' }).getByRole('button', { name: 'Aktionen für export-10.csv' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('bank-import-history-without-empty-actions.png'), animations: 'disabled' })
  await history.getByRole('button', { name: 'Nächste Historienseite' }).click()
  await expect(history).toContainText('export-2.csv')
  await history.locator('.bank-import-history-entry').filter({ hasText: 'export-2.csv' }).getByRole('button', { name: 'Aktionen für export-2.csv' }).click()
  await page.getByRole('dialog', { name: 'Aktionen für export-2.csv' }).getByRole('button', { name: 'Belege anzeigen' }).click()
  await expect(history).toHaveCount(0)
  await expect(page.getByText('Import #2: export-2.csv')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importfilter entfernen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alle Filter zurücksetzen' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Importierte Bankbelege' })).toContainText('Mitglied B')
  await expect(page.getByRole('button', { name: 'Gesamt 1' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).listCalls.at(-1)?.batchId)).toBe(2)
  await page.screenshot({ path: info.outputPath('bank-import-filter-chips.png'), fullPage: true, animations: 'disabled' })
  await page.screenshot({ path: info.outputPath('bank-import-history.png'), fullPage: true })
  await page.getByRole('button', { name: 'Importfilter entfernen' }).click()
  await expect(page.getByRole('button', { name: 'Gesamt 3' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Zahlkonto' })).toHaveValue('1')
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('')
  await page.getByRole('button', { name: 'Importhistorie' }).click()
  await expect(history).toContainText('13 Vorgänge')
  await expect(history).toContainText('export-13.csv')
})

test('filter chips remove one filter or reset all page filters', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await page.getByLabel('Von', { exact: true }).fill('2026-09-01')
  await expect(page.getByRole('button', { name: 'Zahlkontofilter entfernen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Von-Filter entfernen' })).toBeVisible()
  await page.getByRole('button', { name: 'Von-Filter entfernen' }).click()
  await expect(page.getByLabel('Von', { exact: true })).toHaveValue('')
  await expect(page.getByRole('combobox', { name: 'Zahlkonto' })).toHaveValue('1')
  await page.getByRole('button', { name: 'Alle Filter zurücksetzen' }).click()
  await expect(page.getByRole('combobox', { name: 'Zahlkonto' })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Gesamt 4' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alle Filter zurücksetzen' })).toHaveCount(0)
})

test('history menu previews stored CSV assignments and updates an existing bank record', async ({ page }, info) => {
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await page.getByRole('button', { name: 'Importhistorie' }).click()
  const history = page.getByRole('dialog', { name: 'Importhistorie' })
  await expect(history).toContainText('12 Vorgänge')
  await history.locator('.bank-import-history-entry').filter({ hasText: 'export-10.csv' }).getByRole('button', { name: 'Aktionen für export-10.csv' }).click()
  await page.getByRole('dialog', { name: 'Aktionen für export-10.csv' }).getByRole('button', { name: 'Zuordnungen aktualisieren' }).click()
  await expect(history).toHaveCount(0)
  const remap = page.getByRole('dialog', { name: 'Spaltenzuordnungen aktualisieren' })
  await expect(remap).toContainText('1 von 1 Bankbelegen würden aktualisiert')
  await expect(remap.getByText('Merle Beckord')).toHaveCount(0)
  await expect(remap.getByText('Mitglied B')).toBeVisible()
  await page.screenshot({ path: info.outputPath('bank-import-remap.png'), animations: 'disabled' })
  await remap.getByRole('button', { name: '1 Beleg(e) aktualisieren' }).click()
  await expect(remap).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).remapApplies)).toEqual([{ batchId: 10, mapping: { counterparty: 'Name Zahlungsbeteiligter' } }])
})

test('bank rows show counterparty above purpose with a compact date and direction', async ({ page }) => {
  const row = page.getByRole('table', { name: 'Importierte Bankbelege' }).locator('tbody tr').filter({ hasText: 'Mitglied A' })
  await expect(row.locator('.bank-description-button')).toHaveText('Mitglied A')
  await expect(row.locator('.bank-import-purpose-subline')).toHaveText('Beitrag')
  await expect(row.locator('.bank-import-row-date strong')).toHaveText('1')
  await expect(row.locator('.bank-import-direction-symbol--in')).toBeVisible()
})

test('finished import stays visible and opens only its new bank records', async ({ page }, info) => {
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await page.getByRole('button', { name: 'Bankdaten importieren' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'neu.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Buchungstag;Betrag;Verwendungszweck;Name Zahlungsbeteiligter\n25.09.2026;80,00;Neue Spende;Spender') })
  await expect(page.getByRole('button', { name: '1 Beleg(e) importieren' })).toBeEnabled()
  await page.getByRole('button', { name: '1 Beleg(e) importieren' }).click()
  await expect(page.getByText('Import abgeschlossen: neu.csv')).toBeVisible()
  await page.getByRole('button', { name: 'Diesen Beleg anzeigen' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).listCalls.at(-1)?.batchId)).toBe(21)
  await expect(page.getByRole('table', { name: 'Importierte Bankbelege' })).toContainText('Neue Spende')
  await expect(page.getByRole('button', { name: 'Gesamt 1' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('bank-import-outcome.png'), fullPage: true })
})

test('account controls and history fit on a narrow dark page', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await page.getByRole('button', { name: 'Importhistorie' }).click()
  await expect(page.getByRole('dialog', { name: 'Importhistorie' })).toContainText('12 Vorgänge')
  await expect(page.getByRole('button', { name: 'Gesamt 3' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('bank-import-page-dark-mobile.png'), fullPage: true })
})

test('date fields and history dropdown stay within a desktop window', async ({ page }, info) => {
  await page.setViewportSize({ width: 1170, height: 760 })
  await page.getByRole('combobox', { name: 'Zahlkonto' }).selectOption('1')
  await expect(page.getByRole('button', { name: 'Gesamt 3' })).toBeVisible()
  const account = (await page.getByRole('combobox', { name: 'Zahlkonto' }).boundingBox())!
  const from = (await page.getByLabel('Von', { exact: true }).boundingBox())!
  const to = (await page.getByLabel('Bis', { exact: true }).boundingBox())!
  const trigger = (await page.getByRole('button', { name: 'Importhistorie' }).boundingBox())!
  expect(account.x + account.width).toBeLessThanOrEqual(from.x)
  expect(from.x + from.width).toBeLessThanOrEqual(to.x)
  expect(to.x + to.width).toBeLessThanOrEqual(trigger.x)
  expect(trigger.x + trigger.width).toBeLessThanOrEqual(1170)
  await page.getByRole('button', { name: 'Importhistorie' }).click()
  const history = page.getByRole('dialog', { name: 'Importhistorie' })
  await expect(history).toContainText('12 Vorgänge')
  const panel = (await history.boundingBox())!
  expect(panel.x).toBeGreaterThanOrEqual(0)
  expect(panel.x + panel.width).toBeLessThanOrEqual(1170)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1170)
  await page.screenshot({ path: info.outputPath('bank-import-history-dropdown.png'), fullPage: true, animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(history).toHaveCount(0)
})
