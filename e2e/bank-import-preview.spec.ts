import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8') + '\n' + await fs.readFile('src/renderer/views/BankImport/bankImportDialog.css', 'utf8')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { BankImportModal } from './src/renderer/views/BankImport/BankImportView'
      const accounts = [{ id: 1, name: 'Bank', kind: 'BANK', isActive: 1 }, { id: 2, name: 'Weitere Bank', kind: 'BANK', isActive: 1 }]
      window.commits = []
      window.previews = []
      window.closeCalls = 0
      window.api = {
        ai: { settings: { get: async () => ({ hasApiKey: false }) } },
        bankTransactions: { importStatus: async () => ({ lastBookingDate: '2026-09-01', total: 34, recentImports: [], accounts: [
          { id: 1, name: 'Bank', lastImportAt: '2026-09-02 12:30:00', lastBookingDate: '2026-09-01',
            lastImportImportedCount: 34, lastImportFileName: 'september.csv', total: 34 },
          { id: 2, name: 'Weitere Bank', lastImportAt: null, lastBookingDate: null, total: 0 }
        ] }) },
        bankImports: {
          preview: async input => {
            window.previews.push(input)
            if (window.previewDelay) await new Promise(resolve => setTimeout(resolve, window.previewDelay))
            if (window.previewFailure) throw new Error('Test: Prüfung fehlgeschlagen')
            const missingCounterparty = input.mapping?.counterparty === null
            const row = { sourceRow: 2, bookingDate: '2026-01-28', direction: 'OUT', amount: 8.8, currency: 'EUR',
              counterparty: 'Merle Beckord', purpose: input.mapping?.purpose === 'Buchungstext' ? 'SEPA-UEBERWEISUNG' : 'Porto und Versandkosten', errors: [] }
            return { format: 'CSV', headers: ['Buchungstag', 'Betrag', 'Buchungstext', 'Verwendungszweck', 'Name Zahlungsbeteiligter'],
              suggestedMapping: { bookingDate: 'Buchungstag', amount: 'Betrag', purpose: 'Verwendungszweck', counterparty: 'Name Zahlungsbeteiligter' },
              accountIbans: [], detectedPaymentAccountId: input.paymentAccountId || null,
              rows: Array.from({ length: window.previewRowCount || 1 }, (_, i) => ({ ...row, sourceRow: i + 2, errors: missingCounterparty ? ['Gegenpartei-Spalte nicht zugeordnet.'] : window.withError && i === 2 ? ['Ungültiges Datum'] : [] })), summary: { total: window.previewRowCount || 1, valid: missingCounterparty ? 0 : (window.previewRowCount || 1) - (window.withError ? 1 : 0), errors: missingCounterparty ? window.previewRowCount || 1 : window.withError ? 1 : 0 },
              warnings: [...(missingCounterparty ? ['Ordne die CSV-Spalte für die Gegenpartei zu, bevor du importierst.'] : []), ...(input.mapping?.purpose === 'Buchungstext' ? ['Die vorhandene Zweckspalte wird nicht verwendet.'] : [])],
              duplicateRows: input.paymentAccountId === 1 ? Array.from({ length: window.mixedRows ? 1 : window.previewRowCount || 1 }, (_, i) => ({ ...row, sourceRow: i + 2, duplicateBy: window.exactDuplicate ? 'RAW' : 'POTENTIAL', existing: {
                id: 12, bookingDate: '2026-01-28', direction: 'OUT', amount: 8.8, purpose: 'SEPA-UEBERWEISUNG',
                paymentAccountName: 'Bank', sourceFileName: 'alter-export.csv'
              } })) : [] }
          },
          commit: async input => { window.commits.push(input); if (window.commitResult) return window.commitResult; return { imported: input.additionalImportSourceRows?.length || 0,
            duplicates: 0, duplicateRows: [], errors: [], importedTransactionIds: [] } }
        }
      }
      createRoot(document.getElementById('root')).render(<BankImportModal accounts={accounts} onClose={() => { window.closeCalls++ }} onImported={() => {}} notify={() => {}} />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
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
})

async function loadFile(page: import('@playwright/test').Page, account = '1') {
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption(account)
  await page.locator('input[type=file]').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from('Buchungstag;Betrag;Buchungstext;Verwendungszweck;Name Zahlungsbeteiligter\n28.01.2026;-8,80;SEPA-UEBERWEISUNG;Porto und Versandkosten;Merle Beckord') })
  await expect(page.getByRole('table', { name: 'Umsätze vor dem Import prüfen' })).toBeVisible()
}

test('counterparty mapping is prominent and required before a CSV import', async ({ page }) => {
  await loadFile(page, '2')
  const counterparty = page.getByLabel('Gegenpartei *')
  await expect(counterparty).toHaveValue('Name Zahlungsbeteiligter')
  await counterparty.selectOption('')
  await expect(page.getByRole('alert')).toContainText('Gegenpartei')
  await expect(page.getByRole('button', { name: '0 Beleg(e) importieren' })).toBeDisabled()
  await counterparty.selectOption('Name Zahlungsbeteiligter')
  await expect(page.getByRole('button', { name: '1 Beleg(e) importieren' })).toBeEnabled()
})

test('account selection shows its latest import and clears history on account changes', async ({ page }, testInfo) => {
  const history = page.getByRole('region', { name: 'Importhistorie des ausgewählten Kontos' })
  await expect(history).toHaveCount(0)
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('1')
  await expect(history).toContainText('02.09.26')
  await expect(history).toContainText('34 Buchungssätze')
  await expect(history).toContainText('Nächsten Auszug ab 1.9.2026 wählen')
  await expect(history).toContainText('september.csv')
  await page.screenshot({ path: testInfo.outputPath('account-import-history.png') })
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('2')
  await expect(history).toContainText('noch keine Buchungen importiert')
  await expect(history).not.toContainText('september.csv')
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('')
  await expect(history).toHaveCount(0)
})

test('account comes first and actions stay disabled until the file is checked', async ({ page }, testInfo) => {
  await expect(page.getByRole('button', { name: '0 Beleg(e) importieren', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Datei wählen', exact: true })).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).previews)).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('account-first.png') })
  await loadFile(page, '2')
  await expect(page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true })).toBeEnabled()
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('')
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '0 Beleg(e) importieren', exact: true })).toBeDisabled()
})

test('one table shows existing records and requires explicit additional import', async ({ page }, testInfo) => {
  // Reproduce the app's late global CSS and accent-colored primary hover state.
  await page.addStyleTag({ content: await fs.readFile('src/renderer/styles.css', 'utf8') })
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--btn-primary-bg', '#f04414')
    document.documentElement.style.setProperty('--btn-primary-bg-hover', '#d83104')
  })
  await loadFile(page)
  const choice = page.getByRole('switch', { name: /Als zusätzlichen Umsatz/ })
  await expect(choice).not.toBeChecked()
  const importButton = page.getByRole('button', { name: '0 Beleg(e) importieren', exact: true })
  await expect(importButton).toBeDisabled()
  const disabledBackground = await importButton.evaluate(el => getComputedStyle(el).backgroundColor)
  await importButton.hover()
  expect(await importButton.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(disabledBackground)
  await expect(importButton).toHaveCSS('cursor', 'not-allowed')
  await expect(importButton).toHaveCSS('opacity', '0.6')
  await importButton.evaluate(el => (el as HTMLButtonElement).click())
  expect(await page.evaluate(() => (window as any).commits)).toHaveLength(0)
  await expect(page.locator('.bank-modal-footer').getByRole('button', { name: 'Schließen', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('zero-import-disabled.png') })
  await expect(page.getByRole('table')).toHaveCount(1)
  await expect(page.getByText('Bankbeleg #12', { exact: false })).toBeVisible()
  await page.locator('.bank-import-match summary').click()
  await expect(page.getByText('alter-export.csv', { exact: false })).toBeVisible()
  await choice.check()
  await expect(page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true })).toHaveCSS('background-color', 'rgb(240, 68, 20)')
  await page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true }).click()
  expect(await page.evaluate(() => (window as any).commits[0].additionalImportSourceRows)).toEqual([2])
  expect(await page.evaluate(() => (window as any).closeCalls)).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('duplicate-preview-dark.png'), fullPage: true })
})

test('account and mapping changes reset confirmations and recheck duplicates', async ({ page }) => {
  await loadFile(page)
  const choice = page.getByRole('switch', { name: /Als zusätzlichen Umsatz/ })
  await choice.check()
  await page.getByRole('combobox', { name: 'Verwendungszweck', exact: true }).selectOption('Buchungstext')
  await expect(choice).not.toBeChecked()
  await expect(page.getByRole('alert')).toContainText('Zweckspalte')
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('2')
  await expect(page.getByRole('cell', { name: 'Neu', exact: true })).toBeVisible()
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('1')
  await expect(choice).not.toBeChecked()
  await page.getByRole('button', { name: 'Automatisch zuordnen' }).click()
  await expect(page.getByRole('combobox', { name: 'Verwendungszweck', exact: true })).toHaveValue('Verwendungszweck')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('mixed rows support filters, search, exclusions and error details', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.evaluate(() => { Object.assign(window, { previewRowCount: 5, mixedRows: true, withError: true, exactDuplicate: true }) })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await loadFile(page)
  await expect(page.getByRole('table')).toHaveCount(1)
  await expect(page.locator('.bank-import-review-table tbody tr')).toHaveCount(5)
  await expect(page.getByRole('button', { name: '3 Beleg(e) importieren', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Nur Duplikate anzeigen' }).click()
  await expect(page.locator('.bank-import-review-table tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'Fehlerhaft (1)', exact: true }).click()
  await expect(page.getByText('Ungültiges Datum', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  await page.getByRole('button', { name: 'Alle Buchungen (5)', exact: true }).click()
  await page.getByRole('switch', { name: 'Importieren: Zeile 3', exact: true }).uncheck()
  await expect(page.getByRole('button', { name: '2 Beleg(e) importieren', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: 'Importvorschau durchsuchen' }).fill('kein treffer')
  await expect(page.getByText('Keine Buchungen für diesen Filter.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Importvorschau durchsuchen' }).fill('')
  await page.locator('.bank-import-scroll').evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: testInfo.outputPath('mixed-preview-light.png'), fullPage: true })
  await page.getByRole('button', { name: '2 Beleg(e) importieren', exact: true }).click()
  expect(await page.evaluate(() => (window as any).commits[0].selectedSourceRows)).toEqual([2, 5, 6])
  expect(await page.evaluate(() => (window as any).commits[0].additionalImportSourceRows)).toEqual([])
})

test('large previews paginate and keep footer accessible at smaller sizes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1150, height: 740 })
  await page.evaluate(() => { (window as any).previewRowCount = 34 })
  await loadFile(page)
  await expect(page.locator('.bank-import-review-table tbody tr')).toHaveCount(10)
  await page.getByRole('button', { name: 'Nächste Vorschauseite' }).click()
  await expect(page.getByText('11–20 von 34 Buchungen')).toBeVisible()
  await page.getByRole('switch').first().check()
  await page.getByRole('button', { name: 'Vorherige Vorschauseite' }).click()
  await expect(page.getByRole('switch').first()).not.toBeChecked()
  await page.getByRole('button', { name: 'Nächste Vorschauseite' }).click()
  await expect(page.getByRole('switch').first()).toBeChecked()
  const footer = await page.locator('.bank-import-modal > .bank-modal-footer').boundingBox()
  const scroll = await page.locator('.bank-import-scroll').boundingBox()
  expect(scroll!.y + scroll!.height).toBeLessThanOrEqual(footer!.y + 1)
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true }).click({ trial: true })
  await page.screenshot({ path: testInfo.outputPath('large-preview.png') })
  await page.setViewportSize({ width: 560, height: 780 })
  await page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true }).click({ trial: true })
  await page.screenshot({ path: testInfo.outputPath('narrow-preview.png') })
})

test('late preview cannot restore an account after clearing it', async ({ page }) => {
  await page.evaluate(() => { (window as any).previewDelay = 300 })
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('1')
  await page.locator('input[type=file]').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from('test') })
  await expect(page.getByRole('button', { name: 'Wird geprüft …', exact: true })).toBeDisabled()
  await page.getByLabel('Zahlkonto', { exact: false }).selectOption('')
  await page.waitForTimeout(400)
  await expect(page.getByLabel('Zahlkonto', { exact: false })).toHaveValue('')
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('failed recheck blocks stale imports and file removal resets the dialog', async ({ page }) => {
  await loadFile(page, '2')
  await page.evaluate(() => { (window as any).previewFailure = true })
  await page.getByRole('combobox', { name: 'Verwendungszweck', exact: true }).selectOption('Buchungstext')
  await expect(page.getByRole('alert')).toContainText('Prüfung fehlgeschlagen')
  await expect(page.getByRole('button', { name: '0 Beleg(e) importieren', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Datei entfernen' }).click()
  await expect(page.getByRole('button', { name: 'Datei wählen', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('new conflicts discovered during commit still receive a review', async ({ page }) => {
  await loadFile(page, '2')
  await page.evaluate(() => { (window as any).commitResult = { imported: 0, duplicates: 1, errors: [], importedTransactionIds: [], duplicateRows: [{ sourceRow: 2, bookingDate: '2026-01-28', direction: 'OUT', amount: 8.8, purpose: 'Porto', duplicateBy: 'POTENTIAL', existing: { id: 99, bookingDate: '2026-01-28', direction: 'OUT', amount: 8.8, purpose: 'Porto' } }] } })
  await page.getByRole('button', { name: '1 Beleg(e) importieren', exact: true }).click()
  await expect(page.getByText('Import geprüft', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as any).closeCalls)).toBe(0)
})
