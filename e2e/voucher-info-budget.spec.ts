import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/components/modals/voucherInfoActions.css'].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import VoucherInfoModal from './src/renderer/components/modals/VoucherInfoModal'
    const root = createRoot(document.getElementById('root'))
    window.renderVoucher = (windowMode = false) => {
      window.saved = []; window.closeCalls = 0
      window.api = { reimbursements: { list: async () => [] }, classifications: { primary: { list: async () => ({ profile: 'GENERAL', values: [] }) } } }
      root.render(<VoucherInfoModal voucher={{ id: 4, voucherNo: '2026-08-11_00010', date: '2026-08-11', type: 'OUT', sphere: 'IDEELL', primaryClassificationName: 'Sonstiges', description: 'Raummiete August 2026', grossAmount: 320, paymentMethod: 'BANK' }}
        initialEditing windowMode={windowMode} onClose={() => window.closeCalls++} eurFmt={new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'})} fmtDate={value => value} notify={() => {}}
        budgets={[{id: 1, label: 'Jugendhaus'}, {id: 2, label: 'Archiviert', isArchived: 1}]} earmarks={[{id: 3, code: 'JUG', name: 'Jugendarbeit', isActive: 1}]} onSaveMeta={async payload => { window.saved.push(payload) }} />)
    }
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'unrelated-receipt-preview', setup(builder) {
    builder.onResolve({ filter: /\/ReceiptThumbnail$/ }, args => ({ path: args.path, namespace: 'preview-stub' }))
    builder.onLoad({ filter: /.*/, namespace: 'preview-stub' }, () => ({ contents: 'export default function Preview() { return null }', loader: 'js' }))
  } }] })
  script = result.outputFiles[0].text
})

for (const windowMode of [false, true]) {
  test(`selects and saves budget and earmark above the details dialog (windowMode=${windowMode})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.route('https://voucher.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
    await page.goto('https://voucher.test/')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    await page.evaluate(mode => (window as any).renderVoucher(mode), windowMode)
    await page.getByRole('button', { name: '+ Budget', exact: true }).click()
    await page.getByRole('button', { name: 'Budget wählen', exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCSS('z-index', '10000')
    await expect(page.getByRole('option', { name: 'Archiviert' })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('budget-dropdown-visible.png') })
    await page.getByRole('option', { name: 'Jugendhaus', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Budget wählen', exact: true })).toContainText('Jugendhaus')
    await page.getByRole('button', { name: '+ Zweckbindung', exact: true }).click()
    await page.getByRole('button', { name: 'Zweckbindung wählen', exact: true }).click()
    await page.getByRole('option', { name: /Jugendarbeit/ }).click()
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    expect(await page.evaluate(() => (window as any).saved)).toEqual([{ note: null, budgets: [{ budgetId: 1, amount: 320 }], earmarks: [{ earmarkId: 3, amount: 320 }], tags: [] }])
    expect(await page.evaluate(() => (window as any).closeCalls)).toBe(0)
  })
}
