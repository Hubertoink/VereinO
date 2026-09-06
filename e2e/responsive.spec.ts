import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let app: ElectronApplication
let page: Page
let userDataDir: string

test.beforeAll(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-responsive-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [path.resolve('dist-electron/main/index.cjs'), `--user-data-dir=${userDataDir}`],
    env: {
      ...env,
      ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString()
    }
  })
  page = await app.firstWindow()
  await expect(page.locator('.side-nav, .top-nav').getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({
    timeout: 30_000
  })
  const later = page.getByRole('button', { name: 'Später', exact: true })
  await later.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  if (await later.isVisible()) await later.click()
  await page.evaluate(async () => {
    await window.api.settings.set({ key: 'backup.lastAuto', value: Date.now() })
    await window.api.settings.set({ key: 'updates.autoCheck', value: false })
    const { paymentAccounts } = await window.api.app.bootstrap()
    const account = paymentAccounts[0]
    for (let index = 0; index < 8; index++) {
      await window.api.vouchers.create({
        date: new Date().toISOString().slice(0, 10),
        type: index % 2 ? 'IN' : 'OUT',
        sphere: 'IDEELL',
        description:
          index === 0
            ? 'Material für das Vereinsfest – lange Beschreibung mit zusätzlichen Informationen'
            : `Testbuchung ${index}`,
        grossAmount: 1234.56 + index,
        vatRate: 0,
        paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK',
        paymentAccountId: account.id
      })
    }
    window.dispatchEvent(new Event('data-changed'))
  })
})

test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) await screenshot('failure')
})

test.afterAll(async () => {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
  if (userDataDir)
    await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

async function screenshot(name: string) {
  await page.screenshot({
    path: `test-results/responsive-${name}.png`,
    fullPage: false,
    animations: 'disabled'
  })
}

// Decorative circles intentionally extend beyond the clipped balance/stacked cards.
// Check their parent layout and actual controls instead of their scrollWidth.
async function expectFits(selector: string) {
  const overflow = await page.locator(selector).evaluateAll((elements) =>
    elements
      .filter((element) => element.clientWidth > 0)
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        className: element.className,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth
      }))
  )
  expect(overflow, `Horizontal overflow in ${selector}`).toEqual([])
}

test('tiled layouts keep journal details accessible and preserve column preferences', async () => {
  test.setTimeout(120_000)
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize())
  ).toEqual(process.platform === 'linux' ? [0, 0] : [640, 560])
  await page.locator('.side-nav, .top-nav').getByRole('button', { name: 'Buchungen', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.locator('.journal-table')).toBeVisible()
  await expect(page.locator('.journal-table tbody tr')).toHaveCount(8)
  const wideHeaders = await page.locator('.journal-table thead th').allTextContents()
  const savedPreferences = await page.evaluate(() => JSON.stringify(localStorage))
  for (const width of [960, 800, 640, 629]) {
    await page.setViewportSize({ width, height: 720 })
    await expect(page.locator('.journal-table--compact')).toBeVisible()
    await expect(page.locator('.journal-table thead th')).toHaveCount(3)
    await page.locator('.journal-table-scroll-wrapper').evaluate((el) => {
      el.scrollTop = 0
    })
    await screenshot(`journal-${width}`)
    await expectFits('.app-main, .journal-table-scroll-wrapper')
  }
  await page.getByRole('button', { name: 'Alle Spalten', exact: true }).click()
  expect(await page.locator('.journal-table thead th').allTextContents()).toEqual(wideHeaders)
  await page.getByRole('button', { name: 'Kompaktansicht', exact: true }).click()
  await page
    .getByRole('button', { name: /^Details zu/ })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await screenshot('details-640')
  await page.setViewportSize({ width: 640, height: 560 })
  await screenshot('details-640-short')
  await expectFits('[role="dialog"]')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.locator('.journal-table--compact')).toHaveCount(0)
  expect(await page.locator('.journal-table thead th').allTextContents()).toEqual(wideHeaders)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(savedPreferences)
})

test('core views and compact booking flyout fit a small tile', async () => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 640, height: 560 })
  for (const name of ['Dashboard', 'Bankimport', 'Mitglieder', 'Einstellungen', 'Buchungen']) {
    await page.locator('.side-nav, .top-nav').getByRole('button', { name, exact: true }).click()
    await expect(page.locator('.app-main')).toBeVisible()
    await page.waitForTimeout(500)
    await screenshot(`${name}-640-short`)
    await expectFits('.app-main')
  }
  await page.locator('.fab-buchung').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await screenshot('booking-640-short')
  await expectFits('[role="dialog"]')
  await dialog.getByRole('button', { name: 'Buchungskonto wählen' }).click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('23.45')
  await dialog.getByPlaceholder('Was wurde gebucht?').fill('Im kleinen Flyout gespeichert')
  await page.locator('body').dispatchEvent('mousedown')
  await dialog.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
  await page.waitForTimeout(500)
  await screenshot('flyout-after-save')
  await expect(dialog).toHaveCount(0)
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await window.api.vouchers.recent({ limit: 50 })).rows.filter(
            (row) => row.description === 'Im kleinen Flyout gespeichert'
          ).length
      )
    )
    .toBe(1)
})

test('dialog and detached entry remain usable at 640 pixels', async () => {
  test.setTimeout(120_000)
  await page.locator('.side-nav, .top-nav').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await page.locator('.settings-cluster-trigger').filter({ hasText: 'Darstellung' }).click()
  await page.locator('.settings-subnav').getByTitle('Arbeitsweise', { exact: true }).click()
  await page
    .getByRole('group', { name: 'Darstellung der Buchungserfassung' })
    .getByRole('button', { name: 'Dialog', exact: true })
    .click()
  await page.locator('.side-nav, .top-nav').getByRole('button', { name: 'Buchungen', exact: true }).click()
  await page.locator('.fab-buchung').click()
  const dialog = page.locator('.quick-add-modal')
  await expect(dialog).toBeVisible()
  for (const width of [960, 800, 640, 629]) {
    await page.setViewportSize({ width, height: 560 })
    await dialog.locator('form').evaluate((el) => {
      el.scrollTop = 0
    })
    await screenshot(`dialog-${width}-short`)
    await expectFits('.quick-add-modal, .quick-add-form')
  }
  await dialog.getByRole('button', { name: 'Buchungskonto wählen' }).click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('42.50')
  await dialog.locator('#quick-add-description').fill('Im kleinen Dialog gespeichert')
  await page.locator('body').dispatchEvent('mousedown')
  await dialog
    .getByRole('button', { name: /^Speichern/ })
    .first()
    .click()
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await window.api.vouchers.recent({ limit: 50 })).rows.filter(
            (row) => row.description === 'Im kleinen Dialog gespeichert'
          ).length
      )
    )
    .toBe(1)
  if (await dialog.isVisible())
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.locator('.fab-buchung').click()
  const detachedPromise = app.waitForEvent('window')
  await dialog.getByRole('button', { name: 'In eigenes Fenster abdocken' }).click()
  const detached = await detachedPromise
  await detached.setViewportSize({ width: 640, height: 560 })
  const detachedDialog = detached.locator('.detached-quick-add-modal')
  await expect(detachedDialog).toBeVisible()
  await detachedDialog.locator('form').evaluate((el) => {
    el.scrollTop = 0
  })
  await detached.screenshot({
    path: 'test-results/responsive-detached-640.png',
    animations: 'disabled'
  })
  expect(await detachedDialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await detachedDialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
})

test('top navigation switches for a narrow tile without changing the preference', async () => {
  await page.evaluate(() => localStorage.setItem('ui.navLayout', 'top'))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.reload()
  await expect(page.locator('.top-nav')).toBeVisible()
  await screenshot('wide-top-nav')
  await page.setViewportSize({ width: 640, height: 560 })
  await expect(page.locator('.side-nav')).toBeVisible()
  await page.locator('.side-nav, .top-nav').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.locator('.top-nav')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('ui.navLayout'))).toBe('top')
})

test('search and action buttons fit inside the visible viewport', async () => {
  test.setTimeout(120_000)
  for (const width of [629, 560, 480]) {
    await page.setViewportSize({ width, height: 680 })
    for (const name of [
      'Buchungen',
      'Reports',
      'Mitglieder',
      'Bankimport',
      'Verbindlichkeiten',
      'Budgets',
      'Zweckbindungen',
      'Einstellungen'
    ]) {
      await page.locator('.side-nav, .top-nav').getByRole('button', { name, exact: true }).click()
      await page.waitForTimeout(200)
      await screenshot(`controls-${name}-${width}`)
      const escaped = await page
        .locator(
          '.app-header__controls button, .journal-filter-controls input, .journal-filter-controls button, .report-toolbar-actions button, .members-header input, .members-header button, .invoices-header input, .invoices-header button'
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)
            })
            .map((el) => ({
              element: el.className,
              text: el.getAttribute('aria-label') || el.textContent
            }))
        )
      expect(escaped, `${name} at ${width}: clipped controls`).toEqual([])
      await expectFits('.app-main')
    }
  }
})

test('open filters remain inside the window when a tile shrinks', async () => {
  await page.setViewportSize({ width: 629, height: 680 })
  await page.locator('.side-nav, .top-nav').getByRole('button', { name: 'Buchungen', exact: true }).click()
  await page.locator('.journal-filter-controls .filter-dropdown__trigger').first().click()
  const panel = page.locator('.filter-dropdown__panel')
  await expect(panel).toBeVisible()
  await page.setViewportSize({ width: 480, height: 560 })
  await screenshot('open-filter-480')
  const rect = await panel.boundingBox()
  expect(rect!.x).toBeGreaterThanOrEqual(0)
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(480)
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(560)
  await panel.getByRole('button', { name: 'Schließen', exact: true }).click()
})

test('new dashboard, reports and bookings plus remain usable in half-screen tiles', async () => {
  test.setTimeout(120_000)
  await page.evaluate(() => localStorage.setItem('ui.bookingView', 'plus'))
  await page.reload()
  const nav = page.locator('.side-nav, .top-nav')
  for (const width of [960, 800, 640, 480]) {
    await page.setViewportSize({ width, height: 560 })
    await nav.getByRole('button', { name: 'Dashboard', exact: true }).click()
    await expect(page.locator('.dp-balance')).toBeVisible()
    await expectFits('.app-main, .dashboard-plus, .dp-card:not(.dp-balance):not(.dp-stacked), .dp-navigation')
    await expectFits('.dp-card-heading, .dp-stack-controls, .dp-balance-value, .dp-card footer')
    await screenshot(`dashboard-plus-${width}`)
    await page.locator('.dp-stacked').getByRole('button', { name: 'Tabelle', exact: true }).click()
    await expect(page.locator('.dp-stacked table')).toBeVisible()
    await expectFits('.app-main, .dashboard-plus')
    await page.locator('.dp-stacked').getByRole('button', { name: 'Diagramm', exact: true }).click()
    await page.getByRole('tab', { name: 'Letzte Aktionen', exact: true }).click()
    await expect(page.locator('.dp-activity')).toBeVisible()
    await expectFits('.app-main, .dashboard-plus')
    await page.getByRole('tab', { name: 'Übersicht', exact: true }).click()
    await nav.getByRole('button', { name: 'Reports', exact: true }).click()
    await expect(page.locator('.report-payment-list')).toBeVisible()
    await expectFits('.app-main, .reports-plus, .report-summary-kpis, .dp-card:not(.dp-balance), .report-toolbar-actions')
    await screenshot(`reports-plus-${width}`)
    await page.locator('.report-toolbar-actions .filter-dropdown__trigger').first().click()
    await expectFits('.filter-dropdown__panel')
    await page.locator('.filter-dropdown__panel').getByRole('button', { name: 'Schließen', exact: true }).click()
    await nav.getByRole('button', { name: 'Buchungen', exact: true }).click()
    await expect(page.locator('.bp-row').first()).toBeVisible()
    await expectFits('.app-main, .bookings-plus, .bp-heading, .bp-list, .bp-row')
    const filters = page.locator('.bp-filter-toggle')
    await filters.click()
    await expect(page.locator('.bp-calendar')).toBeVisible()
    await expectFits('.bp-sidebar, .bp-filters')
    await filters.click()
    await page.locator('.bp-header-search input').fill('Material für das Vereinsfest')
    await expect(page.locator('.bp-row')).toHaveCount(1)
    await screenshot(`bookings-plus-${width}`)
    await page.locator('.bp-row').click()
    const details = page.getByRole('dialog', { name: 'Ausgewählte Buchung' })
    await expect(details).toBeVisible()
    await expect(details.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeInViewport()
    await expectFits('.bp-inspector--open')
    await screenshot(`bookings-plus-details-${width}`)
    await details.getByRole('button', { name: 'Details schließen' }).click()
    await page.locator('.bp-header-search input').fill('')
    await expect(page.locator('.bp-row').nth(1)).toBeVisible()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.bp-filter-toggle')).toBeHidden()
  await expect(page.locator('.bp-inspector')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('ui.bookingView'))).toBe('plus')
})
