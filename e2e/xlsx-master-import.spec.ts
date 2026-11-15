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
      import { ImportXlsxCard } from './src/renderer/views/Settings/components/ImportXlsxCard'
      window.calls = { created: 0, committed: 0, analyzed: [] }
      let created = false
      const master = { id: 'Konten:2', entity: 'paymentAccounts', sourceSheet: 'Konten', sourceRow: 2, reference: 'Schnurz', name: 'Schnurz', kind: 'Unklar', year: '', amountPlanned: '', sphere: '', category: '', code: '', status: 'error', issues: ['Bitte einen Kontotyp zuordnen.'] }
      const row = { id: '2', sourceRow: 2, status: 'error', duplicateAction: 'import', issues: [], original: {}, values: { date: '2026-06-01', description: 'Eintritt', type: 'IN', category: 'Veranstaltungen', paymentAccount: 'Schnurz', grossAmount: 50 } }
      window.api = { imports: {
        preview: async () => ({ headers: ['Datum', 'Kategorie', 'Konto', 'Brutto'], sample: [], headerRowIndex: 1, suggestedMapping: { date: 'Datum', category: 'Kategorie', paymentAccount: 'Konto', grossAmount: 'Brutto' }, organizationProfile: 'GENERAL' }),
        analyze: async input => {
          window.calls.analyzed.push(input)
          const current = input.masterData?.[0] || master
          const valid = ['BANK', 'CASH'].includes(current.kind)
          return { headers: [], sample: [], headerRowIndex: 1, suggestedMapping: {}, organizationProfile: 'GENERAL',
            masterData: [{ ...current, status: created ? 'existing' : valid ? 'new' : 'error', issues: valid ? [] : master.issues }],
            rows: (input.draftRows || [row]).map(r => ({ ...r, status: created ? 'ok' : 'error' })),
            summary: { total: 1, ok: created ? 1 : 0, errors: created ? 0 : 1, warnings: 0, duplicates: 0, ignored: 0 },
            missing: { tags: [], budgets: [], earmarks: [], paymentAccounts: created ? [] : ['Schnurz'] },
            lookup: { paymentAccounts: created ? [{ id: 1, label: '#1 | Schnurz [CASH]' }] : [], budgets: [], earmarks: [], tags: [], categories: [{ id: 1, label: 'Veranstaltungen' }] } }
        },
        createMissing: async input => { window.calls.created++; window.createdInput = input; created = true; return { paymentAccounts: 1 } },
        commitDraft: async input => { window.calls.committed++; window.committedInput = input; return { imported: 1, skipped: 0, errors: [] } }
      } }
      createRoot(document.getElementById('root')).render(<ImportXlsxCard />)
    ` }, bundle: true, write: false, jsx: 'automatic', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test('requires account assignment and revalidation, preserves booking edits and prevents repeat imports', async ({ page }, testInfo) => {
  await page.route('http://import.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div id="root" style="padding:24px"></div></html>' }))
  await page.goto('http://import.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await page.locator('input[type=file]').setInputFiles({ name: 'buchungen.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fixture') })
  await page.getByRole('button', { name: 'Validieren & Entwurf laden' }).click()
  const create = page.getByRole('button', { name: /Geprüfte Stammdaten anlegen/ })
  const commit = page.getByRole('button', { name: /Jetzt übernehmen/ })
  await expect(create).toBeDisabled()
  await expect(commit).toBeDisabled()
  await expect(page.getByRole('columnheader', { name: 'Kategorie', exact: true })).toBeVisible()
  await expect(page.getByText('Bitte einen Kontotyp zuordnen.', { exact: true })).toBeVisible()
  await page.getByLabel('Kontotyp Schnurz').selectOption('CASH')
  await page.locator('input[value="Eintritt"]').fill('Korrigierter Eintritt')
  await expect(create).toBeDisabled()
  await page.getByRole('button', { name: 'Stammdaten & Buchungen erneut prüfen' }).click()
  await expect(create).toBeEnabled()
  await expect(commit).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('master-data-review.png'), fullPage: true })
  await create.click()
  await expect(page.locator('input[value="Korrigierter Eintritt"]')).toBeVisible()
  await expect(commit).toBeEnabled()
  await commit.click()
  await expect(commit).toBeDisabled()
  expect(await page.evaluate(() => (window as any).calls.created)).toBe(1)
  expect(await page.evaluate(() => (window as any).committedInput.rows[0].values.description)).toBe('Korrigierter Eintritt')
})
