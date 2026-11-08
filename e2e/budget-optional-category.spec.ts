import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/compactBookingFlyout.css', 'src/renderer/components/modalHeader.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import BudgetModal from './src/renderer/components/modals/BudgetModal'
    window.payloads = []
    window.api = { classifications: { primary: { list: async () => ({ profile: 'GENERAL', values: [] }) } }, budgets: { upsert: async payload => { window.payloads.push(payload); return { id: 14 } } } }
    createRoot(document.getElementById('root')).render(<BudgetModal value={{ year: 2026, sphere: 'IDEELL', amountPlanned: 1000, name: 'Jugendarbeit' }} onClose={() => {}} onSaved={() => {}} />)
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})
for (const category of ['', 'Material']) test(`saves a budget with optional free-text category '${category}'`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.route('https://budget.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('https://budget.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('#budget-primary-category')).toHaveCount(0)
  await page.getByLabel('Kategorie (optional)', { exact: true }).fill(category)
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).payloads.length)).toBe(1)
  expect(await page.evaluate(() => (window as any).payloads[0])).toMatchObject({ name: 'Jugendarbeit', primaryClassificationValueId: null, categoryName: category || null })
})
