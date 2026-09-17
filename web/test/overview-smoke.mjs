// Original Dashboard/Reports against isolated booking fixtures; never mutates a server.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const general = process.env.WEB_TEST_PROFILE === 'GENERAL'
const base = process.env.WEB_TEST_URL || 'http://localhost:5174'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--disable-dev-shm-usage', '--disable-gpu']
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let failBookings = false
  const row = (id, type, grossAmountCents, date, paymentMethod = 'BANK') => ({
    id, type, grossAmountCents, date, paymentMethod, primaryClassificationValueId: id === 1 ? 17 : null, primaryClassificationName: id === 1 ? 'Haushalt' : null, sphere: 'IDEELL', description: `Test ${id}`, version: 1
  })
  const bookings = [row(1, 'IN', 10001, '2026-07-01'), row(2, 'OUT', 2345, '2026-07-31', 'CASH'), row(3, 'IN', 20, '2026-08-05')]
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
      if(path==='/api/settings/modules')return route.fulfill({json:{version:0}})
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
    assert.equal(route.request().method(), 'GET', 'overview must not mutate data')
    if (path === '/api/bookings' && failBookings) return route.fulfill({ status: 503, json: { message: 'Testweise nicht erreichbar' } })
    let result
    if (/^\/api\/bookings\/\d+\/attachments$/.test(path)) result = { files: [], canUpload: true, canDelete: true }
      else if (path === '/api/settings/preferences') result = { preferences: { version: 0, themeMode: 'dark', colorTheme: 'default', navLayout: 'left', navIconColorMode: 'color' } }
      else if (path === '/api/settings/workflow') result = { settings: { version: 0, bookingView: 'plus' } }
      else if (path === '/api/settings/table') result = { settings: { version: 0, columns: {}, columnOrder: [] } }
      else if (path === '/api/settings/profile') result = { profile: general ? 'GENERAL' : 'NONPROFIT', version: 0 }
      else if (path === '/api/classifications/primary') result = { profile: general ? 'GENERAL' : 'NONPROFIT', definition: { primaryLabel: general ? 'Kategorie' : 'Sphäre' }, values: [{ id: 17, name: 'Haushalt', isActive: true }] }
      else if (path === '/api/auth/status') result = { setupRequired: false }
    else if (path === '/api/auth/me') result = { user: { id: 1, email: 'admin@example.test', role: 'ADMIN', organizationId: 1, organizationName: 'VereinO Testverein' } }
    else if (path === '/api/bookings') result = { bookings }
    else if (path === '/api/drafts') result = { drafts: [] }
    else if (path === '/api/planning/budgets' || path === '/api/planning/earmarks') result = { rows: [] }
    else if (path === '/api/organizations') result = { organizations: [] }
    else throw new Error(`Unexpected overview API request: ${path}`)
    await route.fulfill({ json: result })
  })
  await page.goto(base)
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByText('Gebuchter Gesamtbestand', { exact: true }).waitFor()
  assert.equal((await page.locator('.dp-balance-value strong').innerText()).replace(/\s/g, ' '), '76,76 €')
  assert.equal(await page.getByText('Menschen im Verein', { exact: true }).count(), 0, 'unavailable member snapshot must not pretend zero members')
  await page.getByRole('button', { name: 'Berichte', exact: true }).click()
  await page.locator('.report-summary-kpis').getByText('100,21 €', { exact: true }).waitFor()
  const kpis = (await page.locator('.report-summary-kpis').innerText()).replace(/\s/g, ' ')
  assert.match(kpis, /Ausgaben \(Brutto\) 23,45 €/)
  assert.match(kpis, /Saldo 76,76 €/)
  assert.equal(await page.getByRole('button', { name: 'Exportoptionen', exact: true }).count(), 1, 'CSV export is available in the original report toolbar')
  await page.getByRole('heading', { name: general ? 'Verteilung nach Kategorie' : 'Verteilung nach Sphäre', exact: true }).waitFor()
  if (general) assert.equal(await page.getByRole('button', { name: 'Mitglieder', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await page.locator('.filter-dropdown__field').filter({ has: page.getByText(general ? 'Kategorie' : 'Sphäre', { exact: true }) }).locator('select').selectOption(general ? '17' : 'WGB')
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
  await page.locator('.report-summary-kpis').getByText(general ? '100,01 €' : '0,00 €', { exact: true }).first().waitFor()
  assert(!((await page.locator('.report-summary-kpis').innerText()).includes('100,21')), 'sphere filter must update report totals')
  await page.getByRole('button', { name: 'Alle Filter zurücksetzen', exact: true }).click()
  await page.locator('.report-summary-kpis').getByText('100,21 €', { exact: true }).waitFor()
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `unexpected document overflow at ${width}px`)
  }
  failBookings = true
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('heading', { name: 'Auswertung konnte nicht geladen werden' }).waitFor()
  assert.equal(await page.locator('.dp-balance-value').count(), 0, 'failed data must not appear as zero balances')
  failBookings = false
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click()
  await page.getByText('Gebuchter Gesamtbestand', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Original overview: balance, reports, filter, responsive layout and failed-load recovery passed.')
} finally {
  await browser.close()
}
