import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let styles: string

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import BookingsPlusView from './src/renderer/views/BookingsPlus/BookingsPlusView'
      const rows = [
        { id: 1, date: '2026-09-09', voucherNo: 'IN-1', type: 'IN', sphere: 'IDEELL', grossAmount: 350, description: 'Einnahme Test', counterparty: 'Ikea', tags: [] },
        { id: 2, date: '2026-09-08', voucherNo: 'OUT-2', type: 'OUT', sphere: 'IDEELL', grossAmount: 100, description: 'Ausgabe Test', tags: [] }
      ]
      window.pendingFilters = []
      window.api = {
        organizations: { onSwitched: () => () => {} },
        vouchers: { list: async (filter) => {
          const selected = rows.filter(row => !filter.type || row.type === filter.type)
          if (filter.limit === 20 && filter.type) await new Promise(resolve => window.pendingFilters.push(resolve))
          return { rows: selected, total: selected.length }
        }},
        reports: { summary: async filter => ({ byType: filter.type ? [{ key: filter.type, gross: filter.type === 'IN' ? 350 : 100 }] : [{ key: 'IN', gross: 350 }, { key: 'OUT', gross: 100 }] }) }
      }
      createRoot(document.getElementById('root')).render(<BookingsPlusView onResetFilters={() => {}} fmtDate={date => date} onNewBooking={() => {}} onNewInvoice={() => {}} onReviewInvoice={() => {}} notify={() => {}} paymentAccounts={[]} budgets={[]} earmarks={[]} tagDefs={[]} allowVoucherDeletion={false} generalProfile={false} />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'unrelated-widgets', setup(build) {
      build.onResolve({ filter: /\/(AttachmentsModal|VoucherInfoModal|InvoiceBatchControl|ReceiptThumbnail|DateFilterInput|RecentBookingsDropdown)$/ }, args => ({ path: args.path, namespace: 'widget-stub' }))
      build.onLoad({ filter: /.*/, namespace: 'widget-stub' }, () => ({ contents: 'export default function Widget() { return null }', loader: 'js' }))
    }}]
  })
  script = result.outputFiles[0].text
  styles = await readFile('src/renderer/views/BookingsPlus/bookingsPlus.css', 'utf8')
})

test('filter refresh keeps rows, totals and panel geometry until results arrive', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.setContent('<style>:root { --surface:#202532;--text:#fff;--border:#444;--accent:#82baff }body{color:white;background:#111}</style><div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.bp-row')).toHaveCount(2)
  const panel = page.locator('.bp-list')
  const before = await panel.boundingBox()
  const sum = await page.locator('.bp-totals').innerText()
  await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await expect(page.locator('.bp-row').first()).toBeDisabled()
  await expect(page.locator('.bp-totals')).toHaveText(sum, { useInnerText: true })
  const during = await panel.boundingBox()
  expect(during!.height).toBeCloseTo(before!.height, 0)
  expect(during!.y).toBeCloseTo(before!.y, 0)
  await page.evaluate(() => (window as any).pendingFilters.splice(0).forEach((resolve: () => void) => resolve()))
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.bp-row')).toHaveCount(1)
  await expect(page.locator('.bp-row')).toContainText('Einnahme Test')
  await expect(page.locator('.bp-row')).toBeEnabled()
})
