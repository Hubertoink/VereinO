import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import { buildReportMonths, renderReportAnalytics, reportAnalyticsCss } from '../shared/reportAnalytics'

let script: string, css: string
test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import ReportsAnalytics from './src/renderer/components/reports/ReportsAnalytics'
    import ExportOptionsModal from './src/renderer/components/modals/ExportOptionsModal'
    import FilterDropdown from './src/renderer/components/dropdowns/FilterDropdown'
    window.calls = []
    window.api = { reports: { years: async () => ({ years: [2025, 2026] }), monthly: async filters => { window.calls.push(filters); if (window.fail) throw Error('offline'); return { buckets: [{ month: '2026-01', gross: filters.type === 'IN' ? 1500 : -300 }, { month: '2026-03', gross: filters.type === 'IN' ? 500 : 100 }] } } }, vouchers: { list: async filters => { window.previewFilters = filters; return { total: 90, rows: [{ id: 1, date: '2026-03-01', description: 'Testbuchung', grossAmount: 50, netAmount: 50, type: 'IN' }] } } }, bindings: { list: async () => ({ rows: [] }) }, budgets: { list: async () => ({ rows: [] }) } }
    function App() {
      const [fields, setFields] = useState(['date', 'description', 'grossAmount'])
      const [exportType, setExportType] = useState('standard')
      const [amountMode, setAmountMode] = useState('OUT_NEGATIVE')
      const [sortDir, setSortDir] = useState('DESC')
      const [orgName, setOrgName] = useState('Förderverein Jugendhaus')
      const [type, setType] = useState(undefined)
      return <main style={{ padding: 24 }}><button onClick={() => setType('OUT')}>Nur Ausgaben</button><FilterDropdown trigger="Exportieren" title="Exportoptionen" panelClassName="report-export-panel" width="min(920px, calc(100vw - 28px))"><ExportOptionsModal open flyout onClose={() => {}} fields={fields} setFields={setFields} orgName={orgName} setOrgName={setOrgName} amountMode={amountMode} setAmountMode={setAmountMode} sortDir={sortDir} setSortDir={setSortDir} exportType={exportType} setExportType={setExportType} fiscalYear={2026} setFiscalYear={() => {}} dateFrom="2026-01-01" dateTo="2026-03-31" previewFilters={{ type, budgetId: 7 }} onExport={async fmt => { window.exported = fmt }} /></FilterDropdown><ReportsAnalytics type={type} budgetId={7} from="2026-01-01" to="2026-03-31" /></main>
    }
    createRoot(document.getElementById('root')).render(<App />)
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://reports.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://reports.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('monthly comparison respects type and assignment filters; refunds and empty months remain visible', async ({ page }, info) => {
  await page.locator('.ra-totals > summary').click()
  await expect(page.getByRole('table', { name: 'Report-Kennzahlen' })).toContainText('1.800,00')
  await expect(page.getByRole('table', { name: 'Monatsvergleich 2026' })).toContainText('-100,00')
  await page.getByRole('button', { name: 'Nur Ausgaben' }).click()
  await expect(page.locator('.ra-totals')).not.toHaveAttribute('open')
  await page.locator('.ra-totals > summary').click()
  await expect(page.getByRole('table', { name: 'Report-Kennzahlen' })).toContainText('-200,00')
  expect(await page.evaluate(() => (window as any).calls.every((f: any) => f.budgetId === 7))).toBe(true)
  await page.screenshot({ path: info.outputPath('reports-light.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: info.outputPath('reports-dark.png'), fullPage: true })
})

test('export starts compact without vertical overflow and retains options through collapse', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Exportoptionen' }).click()
  const panel = page.locator('.report-export-panel')
  await expect(panel.locator('.export-section[open]')).toHaveCount(0)
  expect(await panel.locator('.filter-dropdown__content').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  await panel.locator('summary').filter({ hasText: 'Darstellung' }).click()
  await panel.getByRole('button', { name: 'Beide positiv' }).click()
  await panel.locator('summary').filter({ hasText: 'Darstellung' }).click()
  await expect(panel.locator('summary').filter({ hasText: 'Darstellung' })).toContainText('Beide positiv')
  await panel.getByRole('button', { name: 'PDF', exact: true }).click()
  expect(await page.evaluate(() => (window as any).exported)).toBe('PDF')
  expect(await page.evaluate(() => (window as any).previewFilters.budgetId)).toBe(7)
  await page.screenshot({ path: info.outputPath('export-compact.png') })
  await page.setViewportSize({ width: 390, height: 700 })
  await panel.locator('summary').filter({ hasText: 'Vorschau' }).click()
  await panel.getByRole('button', { name: 'PDF', exact: true }).scrollIntoViewIfNeeded()
  await expect(panel.getByRole('button', { name: 'PDF', exact: true })).toBeInViewport()
})

test('print includes all years, trends and monthly tables with readable page breaks', async ({ page }, info) => {
  const rows = buildReportMonths([{ month: '2025-01', gross: 100000 }, { month: '2026-03', gross: 1500 }], [{ month: '2025-12', gross: -10000 }], '2025-01-01', '2026-12-31')
  await page.setContent(`<html><head><style>body { font-family:Arial; } ${reportAnalyticsCss}</style></head><body>${renderReportAnalytics(rows, true)}</body></html>`)
  const pdf = await page.pdf({ path: info.outputPath('report-analytics.pdf'), format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } })
  await page.route('http://reports.test/pdf.mjs', async route => route.fulfill({ contentType: 'text/javascript', body: await fs.readFile('node_modules/pdfjs-dist/build/pdf.mjs') }))
  await page.route('http://reports.test/pdf.worker.mjs', async route => route.fulfill({ contentType: 'text/javascript', body: await fs.readFile('node_modules/pdfjs-dist/build/pdf.worker.mjs') }))
  await page.goto('http://reports.test/render')
  const result = await page.evaluate(async bytes => {
    const lib = await import(/* @vite-ignore */ '/pdf.mjs')
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
    const pdf = await lib.getDocument({ data: new Uint8Array(bytes) }).promise
    document.body.innerHTML = ''
    const texts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i), viewport = p.getViewport({ scale: 1.25 })
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; document.body.append(canvas)
      await p.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise
      texts.push((await p.getTextContent()).items.map((item: any) => item.str).join(' '))
    }
    return { pages: pdf.numPages, texts }
  }, [...pdf])
  expect(result.pages).toBeLessThanOrEqual(3)
  expect(result.texts.join(' ')).toContain('Dez. 2025')
  expect(result.texts.join(' ')).toContain('Dez. 2026')
  expect(result.texts.every(text => text.length > 30)).toBe(true)
  for (let i = 0; i < result.pages; i++) await page.locator('canvas').nth(i).screenshot({ path: info.outputPath(`pdf-page-${i + 1}.png`) })
})


test('many years stay compact until the archive is opened', async ({ page }, info) => {
  const rows = buildReportMonths([{ month: '2026-06', gross: 600 }], [{ month: '2026-08', gross: -2000 }], '2013-12-01', '2027-12-31')
  await page.setContent(`<style>${css} ${reportAnalyticsCss}</style>${renderReportAnalytics(rows, false, { today: '2026-09-26' })}`)
  await expect(page.getByRole('table', { name: 'Monatsvergleich 2026' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Monatsvergleich 2013' })).not.toBeVisible()
  expect(await page.locator('.report-analytics').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(1150)
  await page.screenshot({ path: info.outputPath('report-archive-collapsed.png'), fullPage: true })
  await page.locator('.ra-archive > summary').click()
  await page.locator('.ra-archive .ra-year > summary').filter({ hasText: '2013' }).click()
  await expect(page.getByRole('table', { name: 'Monatsvergleich 2013' })).toBeVisible()
  await page.locator('.ra-comparison > summary').click()
  await expect(page.getByRole('table', { name: 'Vormonatsvergleich' })).toContainText('Aug. 2026')
})
