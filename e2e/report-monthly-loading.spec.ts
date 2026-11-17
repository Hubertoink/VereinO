import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

let script: string

test.beforeAll(async () => {
  script = (await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import ReportsView from './src/renderer/views/Reports/ReportsView'
      window.calls = []
      window.pending = []
      window.api = { reports: { monthly: filters => {
        window.calls.push(filters)
        return new Promise((resolve, reject) => window.pending.push({ resolve, reject }))
      } } }
      window.finish = (index, gross) => window.pending[index].resolve({ buckets: [{ month: '2026-01', gross, net: gross, vat: 0 }] })
      function Harness() {
        const [type, setType] = useState(null)
        const [budget, setBudget] = useState(7)
        const [visible, setVisible] = useState(true)
        window.setReportType = setType
        window.setReportBudget = setBudget
        window.setReportVisible = setVisible
        const noop = () => {}
        return visible && <ReportsView from="2026-01-01" to="2026-03-31" setFrom={noop} setTo={noop}
          yearsAvail={[2026]} filterSphere={null} setFilterSphere={noop} filterType={type} setFilterType={setType}
          filterPM={null} setFilterPM={noop} filterEarmark={null} setFilterEarmark={noop}
          filterBudgetId={budget} setFilterBudgetId={setBudget} budgets={[]} earmarks={[]}
          showExportOptions={false} setShowExportOptions={noop} exportOptions={{}}
          showActivityReportEditor={false} setShowActivityReportEditor={noop} activityReportOptions={{}}
          refreshKey={0} activateKey={0} />
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    ` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'unrelated-report-controls', setup(builder) {
      builder.onResolve({ filter: /(?:ReportsSummary|ReportsSphereDonut|ReportsPaymentMethodBars|ExportOptionsModal|ActivityReportEditorModal|components\/dropdowns)$/ }, args => ({ path: args.path, namespace: 'report-stub' }))
      builder.onLoad({ filter: /.*/, namespace: 'report-stub' }, () => ({
        contents: 'export default function Stub() { return null }; export const FilterDropdown = Stub; export const MetaFilterDropdown = Stub; export const TimeFilterDropdown = Stub;', loader: 'js'
      }))
    } }]
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: script })
  await expect.poll(() => page.evaluate(() => (window as any).calls.length)).toBe(2)
})

test('all three monthly presentations share one request per visible series', async ({ page }) => {
  expect(await page.evaluate(() => (window as any).calls.map((call: any) => [call.type, call.budgetId]))).toEqual([['IN', 7], ['OUT', 7]])
  await page.evaluate(() => { (window as any).finish(0, 100); (window as any).finish(1, -40) })
  await expect(page.getByRole('img', { name: 'Monatsverlauf', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'IN vs OUT', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Monatsvergleich 2026' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(2)

  await page.evaluate(() => (window as any).setReportType('OUT'))
  await expect.poll(() => page.evaluate(() => (window as any).calls.length)).toBe(3)
  expect(await page.evaluate(() => (window as any).calls[2].type)).toBe('OUT')
  await page.evaluate(() => (window as any).finish(2, -60))
  await page.locator('.ra-totals > summary').click()
  await expect(page.getByRole('table', { name: 'Report-Kennzahlen' })).toContainText('-60,00')
})

test('late results from a previous filter cannot overwrite the current report', async ({ page }) => {
  await page.evaluate(() => (window as any).setReportBudget(9))
  await expect.poll(() => page.evaluate(() => (window as any).calls.length)).toBe(4)
  await page.evaluate(() => { (window as any).finish(2, 1234); (window as any).finish(3, 0) })
  await page.locator('.ra-totals > summary').click()
  const totals = page.getByRole('table', { name: 'Report-Kennzahlen' })
  await expect(totals).toContainText('1.234,00')
  await page.evaluate(() => { (window as any).finish(0, 9999); (window as any).finish(1, -100) })
  await expect(totals).toContainText('1.234,00')
  await expect(totals).not.toContainText('9.999,00')
})

test('a failed shared load can be retried and disposal ignores outstanding requests', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.evaluate(() => (window as any).pending[0].reject(new Error('offline')))
  await expect(page.getByRole('alert')).toContainText('Monatswerte konnten nicht geladen werden')
  await page.getByRole('button', { name: 'Erneut versuchen' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).calls.length)).toBe(4)
  await page.evaluate(() => { (window as any).finish(2, 500); (window as any).finish(3, -100) })
  await expect(page.getByRole('img', { name: 'IN vs OUT' })).toBeVisible()
  await page.evaluate(() => (window as any).setReportBudget(9))
  await expect.poll(() => page.evaluate(() => (window as any).calls.length)).toBe(6)
  await page.evaluate(() => (window as any).setReportVisible(false))
  await expect(page.getByRole('img', { name: 'IN vs OUT' })).toHaveCount(0)
  await page.evaluate(() => {
    (window as any).finish(1, -100)
    ;(window as any).finish(4, 300)
    ;(window as any).pending[5].reject(new Error('late failure'))
  })
  expect(errors).toEqual([])
  await expect(page.getByRole('alert')).toHaveCount(0)
})
