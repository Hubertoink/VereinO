import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { BankImportModal } from './src/renderer/views/BankImport/BankImportView'
      const accounts = [{ id: 1, name: 'Bank', kind: 'BANK', isActive: 1 }, { id: 2, name: 'Weitere Bank', kind: 'BANK', isActive: 1 }]
      window.commits = []
      window.previews = []
      window.api = {
        ai: { settings: { get: async () => ({ hasApiKey: false }) } },
        bankImports: {
          preview: async input => {
            window.previews.push(input)
            const row = { sourceRow: 2, bookingDate: '2026-01-28', direction: 'OUT', amount: 8.8, currency: 'EUR',
              purpose: input.mapping?.purpose === 'Buchungstext' ? 'SEPA-UEBERWEISUNG' : 'Porto und Versandkosten', errors: [] }
            return { format: 'CSV', headers: ['Buchungstag', 'Betrag', 'Buchungstext', 'Verwendungszweck'],
              suggestedMapping: { bookingDate: 'Buchungstag', amount: 'Betrag', purpose: 'Verwendungszweck' },
              accountIbans: [], detectedPaymentAccountId: input.paymentAccountId || null,
              rows: [row], summary: { total: 1, valid: 1, errors: 0 },
              warnings: input.mapping?.purpose === 'Buchungstext' ? ['Die vorhandene Zweckspalte wird nicht verwendet.'] : [],
              duplicateRows: input.paymentAccountId === 1 ? [{ ...row, duplicateBy: 'POTENTIAL', existing: {
                id: 12, bookingDate: '2026-01-28', direction: 'OUT', amount: 8.8, purpose: 'SEPA-UEBERWEISUNG',
                paymentAccountName: 'Bank', sourceFileName: 'alter-export.csv'
              } }] : [] }
          },
          commit: async input => { window.commits.push(input); return { imported: input.additionalImportSourceRows?.length || 0,
            duplicates: 0, duplicateRows: [], errors: [], importedTransactionIds: [] } }
        }
      }
      createRoot(document.getElementById('root')).render(<BankImportModal accounts={accounts} onClose={() => {}} onImported={() => {}} notify={() => {}} />)
    ` }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'expose-import-dialog', setup(builder) {
      builder.onLoad({ filter: /BankImportView\.tsx$/ }, async ({ path }) => ({ contents: await fs.readFile(path, 'utf8') + '\nexport { BankImportModal }', loader: 'tsx' }))
    } }]
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://bank.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div id="root"></div></html>' }))
  await page.goto('http://bank.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' })
  await page.addScriptTag({ content: script })
  await page.locator('input[type=file]').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from('Buchungstag;Betrag;Buchungstext;Verwendungszweck\n28.01.2026;-8,80;SEPA-UEBERWEISUNG;Porto und Versandkosten') })
  await expect(page.getByText('Zahlkonto für Prüfung wählen', { exact: true })).toBeVisible()
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('1')
  await expect(page.getByRole('region', { name: 'Duplikate vor dem Import prüfen' })).toBeVisible()
})

test('defaults to skipping, shows both records and requires explicit additional import', async ({ page }, testInfo) => {
  const choice = page.getByRole('checkbox', { name: /Als zusätzlichen Umsatz/ })
  await expect(choice).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Ohne neue Bankbelege abschließen' })).toBeEnabled()
  await expect(page.getByText('Bereits vorhanden: Bankbeleg #12')).toBeVisible()
  await page.getByRole('region', { name: 'Duplikate vor dem Import prüfen' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('duplicate-preview.png'), fullPage: true })
  await choice.check()
  await page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true }).click()
  expect(await page.evaluate(() => (window as any).commits[0].additionalImportSourceRows)).toEqual([2])
})

test('rechecks account and mapping changes and resets earlier confirmations', async ({ page }) => {
  const choice = page.getByRole('checkbox', { name: /Als zusätzlichen Umsatz/ })
  await choice.check()
  await page.getByRole('combobox', { name: 'Verwendungszweck', exact: true }).selectOption('Buchungstext')
  await expect(choice).not.toBeChecked()
  await expect(page.getByRole('alert')).toContainText('Zweckspalte')
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('2')
  await expect(page.getByRole('region', { name: 'Duplikate vor dem Import prüfen' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'Neu', exact: true })).toBeVisible()
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('1')
  await expect(choice).not.toBeChecked()
  await page.getByRole('button', { name: 'Ohne neue Bankbelege abschließen' }).click()
  expect(await page.evaluate(() => (window as any).commits[0].additionalImportSourceRows)).toEqual([])
})
