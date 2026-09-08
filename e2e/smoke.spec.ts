import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let electronApp: ElectronApplication
let page: Page
let userDataDir: string

async function waitForVereinOWindow(app: ElectronApplication) {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    for (const candidate of app.windows()) {
      await candidate.waitForLoadState('domcontentloaded', { timeout: 1_000 }).catch(() => undefined)
      const title = await candidate.title().catch(() => '')
      if (/VereinO/i.test(title)) return candidate
    }

    const nextWindow = await app.waitForEvent('window', {
      timeout: Math.min(1_000, Math.max(1, deadline - Date.now()))
    }).catch(() => null)

    if (nextWindow) {
      await nextWindow.waitForLoadState('domcontentloaded', { timeout: 1_000 }).catch(() => undefined)
      const title = await nextWindow.title().catch(() => '')
      if (/VereinO/i.test(title)) return nextWindow
    }
  }

  const titles = await Promise.all(app.windows().map(async (candidate) => `"${await candidate.title().catch(() => '')}"`))
  throw new Error(`VereinO window did not open. Open windows: ${titles.join(', ') || 'none'}`)
}

async function openBookingWorkflowSettings() {
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await page.locator('.settings-cluster-trigger').filter({ hasText: 'Darstellung' }).click()
  await page.locator('.settings-subnav').getByTitle('Arbeitsweise', { exact: true }).click()
  return page.getByRole('group', { name: 'Darstellung der Buchungserfassung' })
}

async function chooseBookingView(name: 'Buchungen (klassisch)' | 'Buchungen Plus') {
  await openBookingWorkflowSettings()
  await page.getByRole('group', { name: 'Buchungsansicht', exact: true }).getByRole('button', { name, exact: true }).click()
  await page.getByLabel('Buchungen', { exact: true }).click()
}

async function chooseBookingEntryPresentation(name: 'Dialog' | 'Kompakt-Flyout' | 'Eigenes Fenster') {
  const presentation = await openBookingWorkflowSettings()
  const option = presentation.getByRole('button', { name, exact: true })
  await option.click()
  await expect(option).toHaveClass(/\bactive\b/)
}

async function expectReadablePageCanvas() {
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-color-theme', 'soft-blush')
    document.documentElement.setAttribute('data-background-image', 'mountain-snow')
  })
  const backgroundColor = await page.locator('.app-main').evaluate((main) => getComputedStyle(main).backgroundColor)
  expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(backgroundColor).not.toBe('transparent')

  const tableSurfaces = await page.locator('.app-main table:visible').evaluateAll((tables) =>
    tables.map((table) => {
      const header = table.querySelector('thead th')
      const row = table.querySelector('tbody tr')
      return {
        table: getComputedStyle(table).backgroundColor,
        header: header ? getComputedStyle(header).backgroundColor : null,
        row: row ? getComputedStyle(row).backgroundColor : null
      }
    })
  )
  for (const surface of tableSurfaces) {
    expect(surface.table).not.toBe('rgba(0, 0, 0, 0)')
    expect(surface.header).not.toBe('rgba(0, 0, 0, 0)')
    expect(surface.table).not.toBe(backgroundColor)
    expect(surface.header).not.toBe(surface.table)
    if (surface.row) expect(surface.row).not.toBe('rgba(0, 0, 0, 0)')
  }
}

async function expectReducedFloatingRadii(surface: ReturnType<Page['locator']>) {
  const radii = await surface.evaluate((element) => {
    const ignoredShapes = '[class*="avatar"], [class*="badge"], [class*="chip"], [class*="dot"], [class*="toggle"], [class*="switch"], [class*="progress"], [class*="color"], [class*="spinner"], [class*="icon"], [role="switch"], input[type="checkbox"], input[type="radio"]'
    const nested = Array.from(element.querySelectorAll('*'))
      .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate.offsetParent !== null)
      .filter((candidate) => !candidate.closest(ignoredShapes))
      .map((candidate) => {
        const styles = getComputedStyle(candidate)
        const hasVisibleSurface = styles.backgroundColor !== 'rgba(0, 0, 0, 0)'
          || styles.backgroundImage !== 'none'
          || Number.parseFloat(styles.borderTopWidth) > 0
        return {
          element: `${candidate.tagName.toLowerCase()}.${String(candidate.className).trim().replace(/\s+/g, '.')}`,
          radius: Number.parseFloat(styles.borderRadius),
          hasVisibleSurface
        }
      })
      .filter((candidate) => candidate.hasVisibleSurface && candidate.radius > 6)
    return {
      outer: Number.parseFloat(getComputedStyle(element).borderRadius),
      nested
    }
  })
  expect(radii.outer).toBeLessThanOrEqual(8)
  expect(radii.nested, 'Visible nested surfaces above 6px').toEqual([])
}

test.beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-e2e-'))
  const mainEntry = path.resolve('dist-electron/main/index.cjs')
  const rendererEntry = pathToFileURL(path.resolve('dist/index.html')).toString()
  const launchEnv = { ...process.env }
  // VS Code/Codex terminals can set this for their own Electron host. Passing it
  // through would make electron.exe behave like plain Node and reject Chromium flags.
  delete launchEnv.ELECTRON_RUN_AS_NODE

  electronApp = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    env: {
      ...launchEnv,
      ELECTRON_RENDERER_URL: rendererEntry,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  page = await waitForVereinOWindow(electronApp)
  await expect(page).toHaveTitle(/VereinO/i, { timeout: 15_000 })
  // The native window is created with the startup screen before migrations and
  // IPC handlers are ready. Wait for the actual renderer shell so each test
  // starts against a fully initialized database.
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 })
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  await laterButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  if (await laterButton.isVisible()) {
    await laterButton.click()
    await expect(laterButton).toBeHidden()
  }
})

test.afterEach(async () => {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
  }
  if (userDataDir) {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
})

test('lists older receipts across all pages and counts vouchers with multiple attachments once', async () => {
  await page.evaluate(async () => {
    const bootstrap = await window.api.app.bootstrap()
    const account = bootstrap.paymentAccounts[0]
    if (!account) throw new Error('Receipt test needs a payment account')
    for (let index = 0; index < 47; index++) {
      const withFiles = index < 22
      await window.api.vouchers.create({
        date: withFiles ? '2024-01-01' : '2026-09-01',
        type: 'OUT',
        sphere: 'IDEELL',
        description: withFiles ? `Älterer Beleg ${index + 1}` : `Ohne Beleg ${index + 1}`,
        grossAmount: 10,
        vatRate: 0,
        paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK',
        paymentAccountId: account.id,
        files: withFiles ? [
          { name: 'beleg.txt', mime: 'text/plain', dataBase64: btoa('Beleg') },
          { name: 'anlage.txt', mime: 'text/plain', dataBase64: btoa('Anlage') }
        ] : undefined
      })
    }
  })

  const result = await page.evaluate(() => window.api.vouchers.list({ hasFiles: true, limit: 20 }))
  expect(result.total).toBe(22)
  expect(result.rows).toHaveLength(20)
  expect(result.rows.every(row => row.fileCount === 2)).toBe(true)
  const lastPage = await page.evaluate(() => window.api.vouchers.list({ hasFiles: true, limit: 20, offset: 20 }))
  expect(lastPage.total).toBe(22)
  expect(lastPage.rows).toHaveLength(2)

  await page.getByRole('button', { name: 'Belege', exact: true }).click()
  const receipts = page.locator('.receipts-container')
  const pagination = receipts.getByRole('navigation', { name: 'Belege-Seiten' })
  await expect(receipts.locator('.receipt-card')).toHaveCount(20)
  await receipts.getByRole('button', { name: 'Tabellenansicht', exact: true }).click()
  await expect(receipts.locator('tbody tr')).toHaveCount(20)
  await expect(pagination).toContainText('22 Buchungen mit Belegen · Seite 1 / 2')
  await expect(receipts).not.toContainText('Ohne Beleg')
  await pagination.getByRole('button', { name: 'Weiter', exact: true }).click()
  await expect(receipts.locator('tbody tr')).toHaveCount(2)
  await expect(receipts.getByText('Älterer Beleg 1', { exact: true })).toBeVisible()
  await receipts.locator('tbody tr').last().getByTitle('Belege anzeigen', { exact: true }).click()
  const bookingInfo = page.getByLabel('Buchungsinformationen', { exact: true })
  await expect(bookingInfo).toContainText('10,00')
  await expect(bookingInfo).toContainText('Ausgabe')
  await expect(bookingInfo).toContainText('Zahlweg')
  await expect(bookingInfo).toContainText('Ideell')
  await page.screenshot({ path: 'test-results/receipt-booking-info.png', animations: 'disabled' })
  await page.locator('.attachments-modal').getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(pagination.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled()
  await pagination.getByRole('button', { name: 'Zurück', exact: true }).click()
  await expect(receipts.locator('tbody tr')).toHaveCount(20)
  await receipts.locator('tbody tr').first().getByTitle('Belege anzeigen', { exact: true }).click()
  await page.locator('.attachments-modal').getByTitle('Zur Buchung', { exact: true }).click()
  await expect(page.locator('.attachments-modal')).toHaveCount(0)
  await expect(page.locator('.journal-view').getByText('Älterer Beleg 22', { exact: true })).toBeVisible()
})

test('starts the real Electron app with its preload bridge', async () => {
  await expect(page).toHaveTitle(/VereinO/i)
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Tastaturbefehle öffnen' }).click()
  const shortcutPanel = page.locator('.leader-shortcut-panel')
  await expect(shortcutPanel).toBeVisible()
  await expectReducedFloatingRadii(shortcutPanel)
  await page.getByRole('button', { name: 'Tastaturbefehle schließen' }).click({ position: { x: 2, y: 2 } })

  const bridgeResult = await page.evaluate(async () => ({
    ping: window.api.ping(),
    appInfo: await window.api.app.version(),
    bootstrap: await window.api.app.bootstrap()
  }))

  expect(bridgeResult.ping).toBe('pong')
  expect(bridgeResult.appInfo.name).toBeTruthy()
  expect(bridgeResult.appInfo.version).toMatch(/^\d+\.\d+\.\d+/)
  expect(bridgeResult.bootstrap.counts.pendingSubmissions).toBeGreaterThanOrEqual(0)
  expect(Array.isArray(bridgeResult.bootstrap.paymentAccounts)).toBe(true)
})

test('adjusts and persists background image visibility', async () => {
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Schneeberge', exact: true }).click()
  const visibilitySlider = page.getByRole('slider', { name: 'Bildsichtbarkeit' })
  await expect(visibilitySlider).toBeEnabled()
  await expect(visibilitySlider).toHaveValue('25')
  await visibilitySlider.fill('80')
  await expect(visibilitySlider).toHaveValue('80')
  await expect(page.locator('output[for="background-image-visibility"]')).toHaveText('80 %')

  const visibilityStyles = await page.evaluate(() => ({
    imageOpacity: document.documentElement.style.getPropertyValue('--background-image-opacity'),
    surfaceOpacity: document.documentElement.style.getPropertyValue('--background-surface-opacity')
  }))
  expect(visibilityStyles.imageOpacity).toBe('0.8')
  expect(visibilityStyles.surfaceOpacity).toBe('74.40%')
  await expect.poll(async () => (await page.evaluate(() => window.api.organizations.activeAppearance())).backgroundImageVisibility).toBe(80)
  await page.screenshot({ path: 'test-results/background-visibility-80.png', fullPage: true })

  await page.reload()
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 })
  const laterAfterReload = page.getByRole('button', { name: 'Später', exact: true })
  await laterAfterReload.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  if (await laterAfterReload.isVisible()) await laterAfterReload.click()
  const closeAfterReload = page.locator('.modal-overlay:visible button[aria-label="Schließen"]').first()
  if (await closeAfterReload.isVisible()) await closeAfterReload.click()
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Bildsichtbarkeit' })).toHaveValue('80')
})

test('creates and lists a backup through the real IPC bridge', async () => {
  const result = await page.evaluate(async () => {
    const created = await window.api.backup.make('e2e')
    const listed = await window.api.backup.list()
    return { created, listed }
  })

  expect(result.created.ok, result.created.error || 'Backup creation failed without an error message').toBe(true)
  expect(result.created.filePath).toMatch(/database_.+_e2e\.sqlite$/)
  expect(result.listed.ok).toBe(true)
  expect(result.listed.backups?.some(({ filePath }) => filePath === result.created.filePath)).toBe(true)
})

test('loads split application pages on demand', async () => {
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  if (await laterButton.isVisible()) await laterButton.click()

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.locator('.dashboard-plus .dp-card').first()).toBeVisible()
  await expectReadablePageCanvas()

  const laterAfterDashboard = page.getByRole('button', { name: 'Später', exact: true })
  if (await laterAfterDashboard.isVisible()) await laterAfterDashboard.click()
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await expectReadablePageCanvas()

  await page.getByLabel('Buchungen', { exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Suche', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await page.getByRole('button', { name: 'Dauerbuchungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dauerbuchungen', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await page.locator('.filter-dropdown__trigger').first().click()
  const filterPanel = page.locator('.filter-dropdown__panel')
  await expect(filterPanel).toBeVisible()
  const filterPanelSurface = await filterPanel.evaluate((panel) => {
    const styles = getComputedStyle(panel)
    return {
      backgroundColor: styles.backgroundColor,
      borderRadius: styles.borderRadius,
      boxShadow: styles.boxShadow
    }
  })
  expect(filterPanelSurface.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(filterPanelSurface.borderRadius).toBe('8px')
  expect(filterPanelSurface.boxShadow).not.toBe('none')
  await filterPanel.getByRole('button', { name: 'Schließen' }).click()
  const recurringSummary = page.locator('.recurring-summary-card').first()
  await expect(recurringSummary).toBeVisible()
  await recurringSummary.hover()
  const recurringHoverSurface = await recurringSummary.evaluate((card) => {
    const styles = getComputedStyle(card)
    return {
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow,
      transform: styles.transform
    }
  })
  expect(recurringHoverSurface.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(recurringHoverSurface.boxShadow).toBe('none')
  expect(recurringHoverSurface.transform).toBe('none')

  await page.getByRole('button', { name: 'Bankimport', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bankimport', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  const bankStatusTabs = page.locator('.bank-status-tabs button')
  await expect(bankStatusTabs).toHaveCount(4)
  const bankStatusTab = bankStatusTabs.first()
  await bankStatusTab.hover()
  const bankTabHoverSurface = await bankStatusTab.evaluate((tab) => {
    const styles = getComputedStyle(tab)
    return {
      backgroundColor: styles.backgroundColor,
      borderRadius: styles.borderRadius,
      transform: styles.transform
    }
  })
  expect(bankTabHoverSurface.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(bankTabHoverSurface.borderRadius).toBe('0px')
  expect(bankTabHoverSurface.transform).toBe('none')

  await page.getByRole('button', { name: 'Verbindlichkeiten', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verbindlichkeiten', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await expect(page.locator('.invoices-container')).toBeVisible()
  await expect(page.locator('.invoices-container > .card')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/phase4-invoices-light.png', fullPage: true })

  await page.getByRole('button', { name: 'Budgets', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await expect(page.locator('.budget-management-surface')).toBeVisible()
  await expect(page.locator('.budget-management-surface > .card')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/phase4-budgets-light.png', fullPage: true })

  await page.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Zweckbindungen', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await expect(page.locator('.earmark-management-surface')).toBeVisible()
  await expect(page.locator('.earmark-management-surface > .card')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/phase4-earmarks-light.png', fullPage: true })

  await page.getByRole('button', { name: 'Mitglieder', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mitglieder', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await expect(page.locator('.members-header > .card')).toHaveCount(0)
  await expect(page.locator('.members-header .members-board-card > .card')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/phase4-members-light.png', fullPage: true })

  await page.evaluate(async () => {
    await window.api.advances.create({ recipientName: 'E2E Vorschuss A', issuedAt: '2026-08-29', amount: 125 })
    await window.api.advances.create({ recipientName: 'E2E Vorschuss B', issuedAt: '2026-08-29', amount: 250 })
  })
  await page.getByRole('button', { name: 'Vorschüsse', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Vorschüsse', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await expect(page.locator('.advances-summary-card')).toHaveCount(3)
  await expect(page.locator('.advances-summary-card.card, .advances-list-card.card, .advances-detail-card.card')).toHaveCount(0)
  const advancesSurfaces = await page.locator('.advances-list-card, .advances-person-card').evaluateAll((surfaces) =>
    surfaces.map((surface) => getComputedStyle(surface).backgroundColor)
  )
  expect(advancesSurfaces).toHaveLength(2)
  expect(advancesSurfaces).not.toContain('rgba(0, 0, 0, 0)')
  const advanceRows = page.locator('.advances-recipient-row')
  await expect(advanceRows).toHaveCount(2)
  await expect(advanceRows.first()).toHaveAttribute('aria-pressed', 'true')
  const selectedAdvanceStyle = await advanceRows.first().evaluate((row) => ({
    background: getComputedStyle(row).backgroundColor,
    boxShadow: getComputedStyle(row).boxShadow
  }))
  const unselectedAdvanceBackground = await advanceRows.last().evaluate((row) => getComputedStyle(row).backgroundColor)
  expect(selectedAdvanceStyle.background).not.toBe(unselectedAdvanceBackground)
  expect(selectedAdvanceStyle.boxShadow).not.toBe('none')
  await advanceRows.last().click()
  await expect(advanceRows.last()).toHaveAttribute('aria-pressed', 'true')
  await expect(advanceRows.first()).toHaveAttribute('aria-pressed', 'false')
  await page.screenshot({ path: 'test-results/phase4-advances-light.png', fullPage: true })

  await page.getByRole('button', { name: 'Einreichungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einreichungen', exact: true })).toBeVisible()
  await expectReadablePageCanvas()

  await page.getByRole('button', { name: 'Belege', exact: true }).click()
  await expect(page.locator('.receipts-container').getByRole('heading', { name: 'Belege', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kartenansicht', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expectReadablePageCanvas()

  await page.getByRole('button', { name: 'Reports', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Report', exact: true })).toBeVisible()
  await expectReadablePageCanvas()
  await page.screenshot({ path: 'test-results/phase4-reports-light.png', fullPage: true })
})

test('selects a single invoice in a compact flyout before opening recognition', async () => {
  await page.getByLabel('Buchungen', { exact: true }).click()

  await page.locator('.invoice-split-fab__new').click()
  const uploadFlyout = page.locator('.invoice-single-upload-flyout')
  await expect(uploadFlyout).toBeVisible()
  await expectReducedFloatingRadii(uploadFlyout)
  await expect(uploadFlyout).toContainText('Rechnung hier ablegen')
  await expect(page.locator('.local-invoice-scan')).toHaveCount(0)

  await page.locator('.invoice-batch-control__single-input').setInputFiles({
    name: 'einzelrechnung.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  })

  await expect(uploadFlyout).toHaveCount(0)
  const recognitionDialog = page.locator('.local-invoice-scan')
  await expect(recognitionDialog).toBeVisible()
  await expectReducedFloatingRadii(recognitionDialog)
  await expect(recognitionDialog.getByText('einzelrechnung.png', { exact: true })).toBeVisible()
})

test('queues batch invoices in the Submit folder and exposes the review flyout', async () => {
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  await laterButton.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
  if (await laterButton.isVisible()) await laterButton.click()
  await page.getByLabel('Buchungen', { exact: true }).click()

  const splitControl = page.locator('.invoice-split-fab')
  await expect(splitControl).toBeVisible()
  await expect(splitControl.locator('button')).toHaveCount(2)
  await splitControl.locator('.invoice-split-fab__batch').click()
  const flyout = page.locator('.invoice-batch-flyout')
  await expect(flyout).toBeVisible()
  await expectReducedFloatingRadii(flyout)
  await expect(flyout).toContainText('KI-Rechnungsentwürfe')
  await expect(flyout).toContainText('KI-API-Key')

  await page.locator('.invoice-batch-control__batch-input').setInputFiles({
    name: 'batch-test.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% VereinO batch queue test\n%%EOF')
  })
  await expect(flyout.getByText('batch-test.pdf')).toBeVisible()
  const queue = await page.evaluate(() => window.api.ai.invoiceBatch.list())
  expect(queue.submitDirectory).toMatch(/[\\/]Submit$/)
  expect(queue.rows.some((item) => item.fileName === 'batch-test.pdf')).toBe(true)

  await flyout.getByRole('button', { name: 'batch-test.pdf verwerfen' }).click()
  await expect(flyout.getByText('batch-test.pdf')).toHaveCount(0)
  await expect.poll(async () => page.evaluate(async () => (await window.api.ai.invoiceBatch.list()).rows.length)).toBe(0)

  const duplicatePdf = Buffer.from('%PDF-1.4\n% VereinO saved duplicate test\n%%EOF')
  await page.locator('.invoice-batch-control__batch-input').setInputFiles({
    name: 'duplicate-test.pdf',
    mimeType: 'application/pdf',
    buffer: duplicatePdf
  })
  await expect(flyout.getByText('duplicate-test.pdf')).toBeVisible()

  const savedVoucher = await page.evaluate(async (dataBase64) => {
    const bootstrap = await window.api.app.bootstrap()
    const account = (bootstrap.paymentAccounts as any[])[0]
    if (!account) throw new Error('Duplicate test needs a payment account')
    return window.api.vouchers.create({
      date: '2026-07-01',
      type: 'OUT',
      sphere: 'IDEELL',
      description: 'Bereits gespeicherte Rechnung',
      grossAmount: 10,
      vatRate: 0,
      paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK',
      paymentAccountId: account.id,
      files: [{ name: 'saved-duplicate.pdf', mime: 'application/pdf', dataBase64 }]
    })
  }, duplicatePdf.toString('base64'))

  await page.evaluate(() => window.api.ai.invoiceBatch.list())
  const duplicateItem = flyout.locator('.invoice-batch-item--duplicate')
  await expect(duplicateItem).toContainText('duplicate-test.pdf')
  await expect(duplicateItem).toContainText(savedVoucher.voucherNo)
  await expect(page.getByRole('alert').filter({ hasText: 'als Duplikat angehalten' })).toContainText('als Duplikat angehalten')
  const duplicateQueue = await page.evaluate(() => window.api.ai.invoiceBatch.list())
  expect(duplicateQueue.rows[0]?.isDuplicate).toBe(true)
  expect(duplicateQueue.rows[0]?.duplicateVoucherId).toBe(savedVoucher.id)

  await page.locator('.invoice-batch-control__batch-input').setInputFiles({
    name: 'duplicate-test.pdf',
    mimeType: 'application/pdf',
    buffer: duplicatePdf
  })
  await expect.poll(async () => page.evaluate(async () => (await window.api.ai.invoiceBatch.list()).rows.length)).toBe(1)
  await expect(flyout.getByText(/duplicate-test \(2\)\.pdf/)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'bereits im Batch' })).toBeVisible()

  await duplicateItem.getByRole('button', { name: 'duplicate-test.pdf trotzdem mit KI auslesen' }).click()
  await expect(flyout.locator('.invoice-batch-item--duplicate')).toHaveCount(0)
  await flyout.getByRole('button', { name: 'duplicate-test.pdf verwerfen' }).click()
  await expect.poll(async () => page.evaluate(async () => (await window.api.ai.invoiceBatch.list()).rows.length)).toBe(0)
})

test('presents the optimized booking workflow', async () => {
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  await laterButton.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined)
  if (await laterButton.isVisible()) await laterButton.click()
  await chooseBookingEntryPresentation('Dialog')
  await page.getByLabel('Buchungen', { exact: true }).click()
  const totalCards = page.locator('.filter-totals-stat')
  await expect(totalCards).toHaveCount(3)
  const totalCardBackgrounds = await totalCards.evaluateAll((cards) =>
    cards.map((card) => getComputedStyle(card).backgroundColor)
  )
  expect(totalCardBackgrounds).toHaveLength(3)
  expect(totalCardBackgrounds).not.toContain('rgba(0, 0, 0, 0)')
  const totalsStrip = page.locator('.journal-view .filter-totals-stats')
  const totalsStripStyle = await totalsStrip.evaluate((strip) => {
    const income = strip.querySelector('.filter-totals-stat--in')
    const divider = strip.querySelector('.filter-totals-divider')
    const dividerMark = divider?.querySelector('span')
    const diff = strip.querySelector('.filter-totals-stat--diff')
    return {
      stripLeftBorder: getComputedStyle(strip).borderInlineStartWidth,
      stripRightBorder: getComputedStyle(strip).borderInlineEndWidth,
      incomeLeftBorder: income ? getComputedStyle(income).borderInlineStartWidth : '0px',
      diffRightBorder: diff ? getComputedStyle(diff).borderInlineEndWidth : '0px',
      dividerWidth: divider ? getComputedStyle(divider).flexBasis : '0px',
      dividerMarkRadius: dividerMark ? getComputedStyle(dividerMark).borderRadius : '0px'
    }
  })
  expect(totalsStripStyle.stripLeftBorder).toBe('1px')
  expect(totalsStripStyle.stripRightBorder).toBe('1px')
  expect(totalsStripStyle.incomeLeftBorder).toBe('3px')
  expect(totalsStripStyle.diffRightBorder).toBe('3px')
  expect(totalsStripStyle.dividerWidth).toBe('34px')
  expect(totalsStripStyle.dividerMarkRadius).toBe('4px')
  const incomeCard = page.locator('.filter-totals-stat--in').first()
  await incomeCard.hover()
  const incomeHoverSurface = await incomeCard.evaluate((card) => {
    const styles = getComputedStyle(card)
    return {
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow,
      transform: styles.transform
    }
  })
  expect(incomeHoverSurface.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(incomeHoverSurface.boxShadow).toBe('none')
  expect(incomeHoverSurface.transform).toBe('none')
  await page.screenshot({ path: 'test-results/journal-surface-hierarchy.png', fullPage: true })
  await page.locator('.fab-buchung').click()

  const dialog = page.locator('.quick-add-modal')
  await expect(dialog).toBeVisible()
  await expectReducedFloatingRadii(dialog)
  const bookingFieldContrast = await dialog.locator('#quick-add-date').evaluate((field) => ({
    field: getComputedStyle(field).backgroundColor,
    modal: getComputedStyle(field.closest('.modal') as HTMLElement).backgroundColor,
    border: getComputedStyle(field).borderColor
  }))
  expect(bookingFieldContrast.field).not.toBe(bookingFieldContrast.modal)
  expect(bookingFieldContrast.border).not.toBe('rgba(0, 0, 0, 0)')
  await expect(dialog.getByRole('button', { name: 'Einnahme', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ausgabe', exact: true })).toBeVisible()
  await expect(dialog.getByPlaceholder(/Was wurde gebucht/i)).toBeVisible()
  await expect(dialog.getByText('Zuordnungen', { exact: true })).toBeVisible()
  await dialog.getByTitle('Geschäftspartner anlegen').click()
  const partyEditor = page.locator('.party-editor-modal')
  await expect(partyEditor).toBeVisible()
  await expect(partyEditor.locator('.party-editor-section')).toHaveCount(3)
  await expect(partyEditor.getByRole('heading', { name: 'Stammdaten', exact: true })).toBeVisible()
  await expect(partyEditor.getByRole('heading', { name: 'Kontakt & Anschrift', exact: true })).toBeVisible()
  await expect(partyEditor.getByRole('heading', { name: 'Zahlung & Steuer', exact: true })).toBeVisible()
  const partyFieldContrast = await partyEditor.locator('input').first().evaluate((field) => ({
    field: getComputedStyle(field).backgroundColor,
    modal: getComputedStyle(field.closest('.modal') as HTMLElement).backgroundColor
  }))
  expect(partyFieldContrast.field).not.toBe(partyFieldContrast.modal)
  await partyEditor.evaluate(async (modal) => {
    await Promise.all(modal.getAnimations({ subtree: true }).map((animation) => animation.finished))
  })
  await page.screenshot({ path: 'test-results/party-editor-structured.png', fullPage: true })
  await partyEditor.getByRole('button', { name: 'Schließen' }).click()
  await expect(partyEditor).toHaveCount(0)
  const attachmentCard = dialog.locator('.attachment-card')
  const attachmentActions = attachmentCard.locator('.attachment-actions--header')
  await expect.poll(() => attachmentActions.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await attachmentCard.hover()
  await page.screenshot({ path: 'test-results/booking-editor-hover.png', animations: 'disabled' })
  await expect.poll(() => attachmentActions.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  await expect(attachmentActions.getByRole('button', { name: 'Dateien hinzufügen' })).toBeVisible()
  const detailSummaries = dialog.locator('.booking-details summary')
  await expect(detailSummaries.filter({ hasText: /^Tags/ })).toBeVisible()
  await expect(detailSummaries.filter({ hasText: /^Kommentar/ })).toBeVisible()

  expect(await dialog.locator('input[type="date"]').evaluate(
    (input) => getComputedStyle(input).appearance
  )).toBe('none')
  await expect(dialog.getByRole('button', { name: 'Kalender zur Datumsauswahl öffnen' })).toBeVisible()
  const calendarIcon = dialog.locator('.booking-date-icon')
  await expect(calendarIcon).toBeVisible()
  expect(await calendarIcon.evaluate((icon) => getComputedStyle(icon).color)).not.toBe('rgb(0, 0, 0)')

  const sphereInfo = dialog.getByRole('button', { name: 'Erklärung zu den steuerlichen Bereichen' })
  await sphereInfo.focus()
  const sphereTooltip = page.getByRole('tooltip').filter({ hasText: 'Steuerliche Bereiche' })
  await expect(sphereTooltip).toContainText('Ideeller Bereich')
  await expect(sphereTooltip).toContainText('Zweckbetrieb')
  await expect(sphereTooltip).toContainText('Vermögensverwaltung')
  await expect(sphereTooltip).toContainText('Wirtschaftlicher Geschäftsbetrieb')
  await page.screenshot({ path: 'test-results/quick-add-sphere-tooltip.png', fullPage: true })

  const tagDetails = dialog.locator('.booking-details').first()
  await tagDetails.locator('summary').click()
  await dialog.getByRole('textbox', { name: 'Neuen Tag hinzufügen' }).fill('Testtag')
  await dialog.getByRole('textbox', { name: 'Neuen Tag hinzufügen' }).press('Enter')
  await tagDetails.locator('summary').click()
  await expect(tagDetails.locator('.booking-tag-count')).toHaveText('1')
  await expect(tagDetails.locator('.booking-tag-summary__badge')).toHaveText('Testtag')
  await expect(dialog.locator('.booking-overview-tag')).toHaveText('Testtag')
  expect(await dialog.locator('.booking-overview-tag').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await tagDetails.locator('.booking-tag-summary__badge').evaluate(el => getComputedStyle(el).backgroundColor))
  expect(await dialog.locator('.party-selector__add').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20)


  const commentDetails = dialog.locator('.booking-details').filter({ hasText: 'Kommentar' })
  await commentDetails.locator('summary').click()
  await commentDetails.getByRole('textbox', { name: 'Kommentar zur Buchung' }).fill(
    'Rechnung: 2026_Sep Rechnungsteller nicht eindeutig; Supplier aus Kopfzeile abgeleitet. Betrag aus teilweise unklarer Layout-Extraktion als 200 EUR interpretiert.'
  )
  await commentDetails.evaluate((details) => { (details as HTMLDetailsElement).open = false })
  const commentBounds = await commentDetails.evaluate((details) => {
    const preview = details.querySelector('.booking-comment-preview')
    const attachment = details.closest('.booking-secondary-grid')?.querySelector('.attachment-card')
    if (!preview || !attachment) throw new Error('Comment preview layout is incomplete')
    return {
      previewRight: preview.getBoundingClientRect().right,
      detailsRight: details.getBoundingClientRect().right,
      detailsBottom: details.getBoundingClientRect().bottom,
      attachmentLeft: attachment.getBoundingClientRect().left,
      attachmentTop: attachment.getBoundingClientRect().top
    }
  })
  expect(commentBounds.previewRight).toBeLessThanOrEqual(commentBounds.detailsRight + 1)
  const cardsAreSideBySide = commentBounds.attachmentLeft >= commentBounds.detailsRight - 1
  const attachmentIsBelow = commentBounds.attachmentTop >= commentBounds.detailsBottom - 1
  expect(cardsAreSideBySide || attachmentIsBelow).toBe(true)

  const amountInput = dialog.locator('input[type="number"]').first()
  await expect(amountInput).toHaveValue('')
  await expect(amountInput).toHaveClass(/amount-input|input-transfer/)
  expect(await amountInput.evaluate((input) => getComputedStyle(input).appearance)).toBe('textfield')
  const fieldLayers = await dialog.evaluate((modal) => {
    const card = modal.querySelector('.form-card')
    const input = modal.querySelector<HTMLInputElement>('.form-card .input')
    if (!card || !input) throw new Error('Booking card or field missing')
    return {
      card: getComputedStyle(card).backgroundColor,
      input: getComputedStyle(input).backgroundColor
    }
  })
  expect(fieldLayers.input).not.toBe(fieldLayers.card)
  await amountInput.fill('20')
  await amountInput.evaluate((element) => {
    const input = element as HTMLInputElement & { selectCalled?: boolean }
    const select = input.select.bind(input)
    input.select = () => {
      input.selectCalled = true
      select()
    }
  })
  await amountInput.click()
  expect(await amountInput.evaluate((element) => Boolean((element as HTMLInputElement & { selectCalled?: boolean }).selectCalled))).toBe(true)

  await page.screenshot({ path: 'test-results/quick-add-workflow.png', fullPage: true })
  await page.setViewportSize({ width: 900, height: 720 })
  await expect(dialog.getByRole('button', { name: 'Umbuchung', exact: true })).toBeVisible()
  const hasHorizontalOverflow = await dialog.evaluate(
    (element) => element.scrollWidth > element.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
  await page.screenshot({ path: 'test-results/quick-add-workflow-narrow.png', fullPage: true })
  const transferButton = dialog.getByRole('button', { name: 'Umbuchung', exact: true })
  await transferButton.click()
  await expect(transferButton).toHaveAttribute('aria-pressed', 'true')
  const transferFrom = dialog.getByRole('button', { name: 'Transfer von Konto' })
  const transferTo = dialog.getByRole('button', { name: 'Transfer nach Konto' })
  await expect(transferFrom).toBeVisible()
  await expect(transferTo).toBeVisible()
  const transferLayout = await dialog.locator('.booking-transfer-row').evaluate((row) => {
    const from = row.querySelector('#quick-add-transfer-from')?.getBoundingClientRect()
    const arrow = row.querySelector('.booking-transfer-arrow')?.getBoundingClientRect()
    const to = row.querySelector('#quick-add-transfer-to')?.getBoundingClientRect()
    if (!from || !arrow || !to) throw new Error('Transfer row is incomplete')
    return { from, arrow, to }
  })
  expect(Math.abs(transferLayout.from.top - transferLayout.to.top)).toBeLessThanOrEqual(1)
  expect(transferLayout.from.right).toBeLessThanOrEqual(transferLayout.arrow.left + 1)
  expect(transferLayout.arrow.right).toBeLessThanOrEqual(transferLayout.to.left + 1)
  const transferToLabel = (await transferTo.locator('.select-dropdown__value').innerText()).trim()
  await transferFrom.click()
  await expect(page.getByRole('option', { name: transferToLabel, exact: true })).toBeDisabled()
  await transferFrom.click()
  const transferFromLabel = (await transferFrom.locator('.select-dropdown__value').innerText()).trim()
  await transferTo.click()
  await expect(page.getByRole('option', { name: transferFromLabel, exact: true })).toBeDisabled()
  await transferTo.click()
  await page.screenshot({ path: 'test-results/quick-add-transfer.png', fullPage: true })
  await expect(dialog.getByRole('button', { name: 'Sphäre der Buchung' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
})

test('routes new bookings through the configured dialog, flyout, and detached window', async () => {
  await chooseBookingEntryPresentation('Dialog')

  await page.getByLabel('Buchungen', { exact: true }).click()
  await page.locator('.fab-buchung').click()
  const dialog = page.locator('.quick-add-modal')
  await expect(dialog).toBeVisible()
  await expect(page.locator('.compact-booking-flyout')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()

  await chooseBookingEntryPresentation('Kompakt-Flyout')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ui.bookingEntryPresentation'))).toBe('flyout')
  await page.getByLabel('Buchungen', { exact: true }).click()
  await page.locator('.fab-buchung').click()
  const flyout = page.locator('.compact-booking-flyout')
  await expect(flyout).toBeVisible()
  await expectReducedFloatingRadii(flyout)
  const flyoutFieldContrast = await flyout.getByPlaceholder('Was wurde gebucht?').evaluate((field) => ({
    field: getComputedStyle(field).backgroundColor,
    flyout: getComputedStyle(field.closest('.compact-booking-flyout') as HTMLElement).backgroundColor,
    border: getComputedStyle(field).borderColor
  }))
  expect(flyoutFieldContrast.field).not.toBe(flyoutFieldContrast.flyout)
  expect(flyoutFieldContrast.border).not.toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('.quick-add-modal')).toHaveCount(0)
  const expandButton = flyout.getByRole('button', { name: 'Vollständigen Buchungsdialog öffnen' })
  const expandBounds = await expandButton.boundingBox()
  expect(expandBounds).not.toBeNull()
  await page.mouse.click(expandBounds!.x + expandBounds!.width / 2, expandBounds!.y + expandBounds!.height / 2)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()

  await page.locator('.fab-buchung').click()
  await expect(flyout).toBeVisible()
  const closeButton = flyout.getByRole('button', { name: 'Buchungsflyout schließen' })
  const closeBounds = await closeButton.boundingBox()
  expect(closeBounds).not.toBeNull()
  await page.mouse.click(closeBounds!.x + closeBounds!.width / 2, closeBounds!.y + closeBounds!.height / 2)
  await expect(flyout).toHaveCount(0)

  await chooseBookingEntryPresentation('Eigenes Fenster')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ui.bookingEntryPresentation'))).toBe('detached')
  await page.getByLabel('Buchungen', { exact: true }).click()
  const detachedWindowPromise = electronApp.waitForEvent('window')
  await page.locator('.fab-buchung').click()
  const detachedPage = await detachedWindowPromise
  await detachedPage.waitForLoadState('domcontentloaded')
  const detachedDialog = detachedPage.locator('.detached-quick-add-modal')
  await expect(detachedDialog).toBeVisible()
  await expect(page.locator('.quick-add-modal')).toHaveCount(0)
  await expect(page.locator('.compact-booking-flyout')).toHaveCount(0)

  const detachedWindowClosed = detachedPage.waitForEvent('close')
  await detachedDialog.getByRole('button', { name: 'Schließen' }).evaluate((button: HTMLElement) => button.click()).catch(() => undefined)
  await detachedWindowClosed
})

test('parks a compact booking flyout in a tab and restores all entered content', async () => {
  await chooseBookingEntryPresentation('Kompakt-Flyout')
  const bookingTabsSwitch = page.locator('#toggle-booking-draft-tabs')
  await expect(bookingTabsSwitch).not.toBeChecked()
  await bookingTabsSwitch.check()
  await expect(bookingTabsSwitch).toBeChecked()

  await page.getByLabel('Buchungen', { exact: true }).click()
  await page.locator('.fab-buchung').click()

  const flyout = page.locator('.compact-booking-flyout')
  await expect(flyout).toBeVisible()
  await expect(flyout).toContainText('Aktive Buchungen')
  await flyout.getByPlaceholder('Was wurde gebucht?').fill('Geparkter Reiter-Test')
  await flyout.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('47.50')
  await page.locator('body').dispatchEvent('mousedown')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await flyout.getByRole('button', { name: '+ Kommentar', exact: true }).click()
  await flyout.getByRole('textbox', { name: 'Kommentar zur Buchung' }).fill('Dieser optionale Inhalt bleibt erhalten.')

  const draftTabs = page.getByLabel('Offene Buchungstabs')
  const draftTab = draftTabs.locator('.booking-draft-tab').filter({ hasText: 'Geparkter Reiter-Test' })
  await expect(draftTab).toBeVisible()
  await expect(draftTab).toHaveClass(/booking-draft-tab--active/)
  await page.screenshot({ path: 'test-results/compact-booking-flyout-tabs.png', fullPage: true })

  const flyoutTabSwitcher = flyout.getByRole('button', { name: 'Buchungsreiter wechseln' })
  await expect(flyoutTabSwitcher).toBeVisible()
  await flyout.getByRole('button', { name: 'Neuen Buchungsreiter öffnen' }).click()
  const allDraftTabs = draftTabs.locator('.booking-draft-tab')
  await expect(allDraftTabs).toHaveCount(2)
  const secondDraftTab = allDraftTabs.nth(1)
  await expect(secondDraftTab).toHaveClass(/booking-draft-tab--active/)
  await expect(draftTab).not.toHaveClass(/booking-draft-tab--active/)
  await expect(flyout.getByPlaceholder('Was wurde gebucht?')).toHaveValue('')
  await expect(flyout.getByRole('spinbutton', { name: 'Brutto-Betrag' })).toHaveValue('')

  await flyoutTabSwitcher.click()
  await page.getByRole('option', { name: /Geparkter Reiter-Test/ }).click()
  await expect(draftTab).toHaveClass(/booking-draft-tab--active/)
  await expect(secondDraftTab).not.toHaveClass(/booking-draft-tab--active/)
  await expect(flyout.getByPlaceholder('Was wurde gebucht?')).toHaveValue('Geparkter Reiter-Test')
  await expect(flyout.getByRole('spinbutton', { name: 'Brutto-Betrag' })).toHaveValue('47.5')
  await expect(flyout.getByRole('textbox', { name: 'Kommentar zur Buchung' })).toHaveValue(
    'Dieser optionale Inhalt bleibt erhalten.'
  )

  await flyout.getByRole('button', { name: 'Buchungsflyout parken' }).click()
  await expect(flyout).toHaveCount(0)
  await expect(draftTab).not.toHaveClass(/booking-draft-tab--active/)

  await draftTab.locator('.booking-draft-tab__open').click()
  await expect(flyout).toBeVisible()
  await expect(flyout.getByPlaceholder('Was wurde gebucht?')).toHaveValue('Geparkter Reiter-Test')
  await expect(flyout.getByRole('spinbutton', { name: 'Brutto-Betrag' })).toHaveValue('47.5')
  await expect(flyout.getByRole('textbox', { name: 'Kommentar zur Buchung' })).toHaveValue(
    'Dieser optionale Inhalt bleibt erhalten.'
  )
  await expect(draftTab).toHaveClass(/booking-draft-tab--active/)
})

test('uses the booking FAB as a close toggle for compact entry without draft tabs', async () => {
  await chooseBookingEntryPresentation('Kompakt-Flyout')
  await expect(page.locator('#toggle-booking-draft-tabs')).not.toBeChecked()

  await page.getByLabel('Buchungen', { exact: true }).click()
  const bookingFab = page.locator('.fab-buchung')
  const flyout = page.locator('.compact-booking-flyout')

  await bookingFab.click()
  await expect(flyout).toBeVisible()
  await flyout.getByPlaceholder('Was wurde gebucht?').fill('Temporärer Toggle-Test')

  await bookingFab.click()
  await expect(flyout).toHaveCount(0)
  await expect(page.getByLabel('Offene Buchungstabs')).toHaveCount(0)

  await bookingFab.click()
  await expect(flyout).toBeVisible()
  await expect(flyout.getByPlaceholder('Was wurde gebucht?')).toHaveValue('')
})

test('saves a compact booking exactly once and keeps optional fields progressive', async () => {
  await chooseBookingEntryPresentation('Kompakt-Flyout')
  await page.getByLabel('Buchungen', { exact: true }).click()
  await page.locator('.fab-buchung').click()

  const flyout = page.locator('.compact-booking-flyout')
  await expect(flyout).toBeVisible()
  await expect(flyout.getByRole('button', { name: '+ Tag', exact: true })).toBeVisible()
  await expect(flyout.getByRole('button', { name: '+ Kommentar', exact: true })).toBeVisible()
  await expect(flyout.getByRole('button', { name: '+ Anhang', exact: true })).toBeVisible()
  await expect(flyout.getByRole('textbox', { name: 'Kommentar zur Buchung' })).toHaveCount(0)

  await flyout.getByRole('button', { name: 'Buchungskonto wählen' }).click()
  await page.getByRole('option').first().click()
  await page.locator('body').dispatchEvent('mousedown')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await flyout.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('23.45')
  await flyout.getByPlaceholder('Was wurde gebucht?').fill('Kompakt gespeichert')
  await page.locator('body').dispatchEvent('mousedown')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await flyout.getByRole('button', { name: '+ Kommentar', exact: true }).click()
  await flyout.getByRole('textbox', { name: 'Kommentar zur Buchung' }).fill('Optionaler Kommentar')

  await flyout.getByRole('button', { name: 'Buchung speichern', exact: true }).dblclick()
  await expect(flyout).toHaveCount(0)
  await expect.poll(async () => page.evaluate(async () => {
    const result = await window.api.vouchers.recent({ limit: 50 })
    return result.rows.filter((row) => row.description === 'Kompakt gespeichert').length
  })).toBe(1)
})

test('parks the compact draft while an existing booking is edited and restores it afterwards', async () => {
  await chooseBookingEntryPresentation('Kompakt-Flyout')
  await page.locator('#toggle-booking-draft-tabs').check()
  await page.locator('#toggle-voucher-delete-mode').check()

  await page.evaluate(async () => {
    const bootstrap = await window.api.app.bootstrap()
    const account = (bootstrap.paymentAccounts as any[])[0]
    if (!account) throw new Error('Booking editor test needs a payment account')
    await window.api.vouchers.create({
      date: '2026-07-13',
      type: 'IN',
      sphere: 'IDEELL',
      description: 'Bestehende Buchung für Editorwechsel',
      grossAmount: 12,
      vatRate: 0,
      paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK',
      paymentAccountId: account.id
    })
  })

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByLabel('Buchungen', { exact: true }).click()
  await expect(page.getByText('Bestehende Buchung für Editorwechsel', { exact: true })).toBeVisible()

  await page.locator('.fab-buchung').click()
  const flyout = page.locator('.compact-booking-flyout')
  await flyout.getByPlaceholder('Was wurde gebucht?').fill('Entwurf bleibt im Reiter')
  const draftTab = page.getByLabel('Offene Buchungstabs').locator('.booking-draft-tab').filter({ hasText: 'Entwurf bleibt im Reiter' })
  await expect(draftTab).toHaveClass(/booking-draft-tab--active/)

  const savedRow = page.locator('tr').filter({ hasText: 'Bestehende Buchung für Editorwechsel' })
  await savedRow.getByTitle('Bearbeiten').click()
  const editModal = page.locator('.journal-edit-modal')
  await expect(editModal).toBeVisible()
  await expect(flyout).toHaveCount(0)
  await expect(draftTab).not.toHaveClass(/booking-draft-tab--active/)

  await editModal.getByTitle('Schließen (ESC)').click()
  await expect(editModal).toHaveCount(0)
  await draftTab.locator('.booking-draft-tab__open').click()
  await expect(flyout).toBeVisible()
  await expect(flyout.getByPlaceholder('Was wurde gebucht?')).toHaveValue('Entwurf bleibt im Reiter')
  await expect(draftTab).toHaveClass(/booking-draft-tab--active/)
})

test('keeps expanded tags and comments separated in the detached booking window', async () => {
  await chooseBookingEntryPresentation('Dialog')
  await page.setViewportSize({ width: 1200, height: 780 })
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  if (await laterButton.isVisible()) await laterButton.click()
  await page.getByLabel('Buchungen', { exact: true }).click()
  await page.locator('.fab-buchung').click()

  const dialog = page.locator('.quick-add-modal')
  await expect(dialog).toBeVisible()
  const detachedWindowPromise = electronApp.waitForEvent('window')
  await dialog.getByRole('button', { name: 'In eigenes Fenster abdocken' }).click()
  const detachedPage = await detachedWindowPromise
  await detachedPage.waitForLoadState('domcontentloaded')

  await electronApp.evaluate(({ BrowserWindow }) => {
    const detachedWindow = BrowserWindow.getAllWindows().find(
      (candidate) => Boolean((candidate as typeof candidate & { __isDetachedQuickAddWindow?: boolean }).__isDetachedQuickAddWindow)
    )
    detachedWindow?.setSize(900, 720)
  })

  const detachedDialog = detachedPage.locator('.detached-quick-add-modal')
  await expect(detachedDialog).toBeVisible()
  await detachedDialog.locator('.booking-details').nth(0).locator('summary').click()
  await detachedDialog.locator('.booking-details').nth(1).locator('summary').click()

  const layout = await detachedDialog.evaluate((modal) => {
    const rect = (selector: string) => {
      const element = modal.querySelector(selector)
      if (!element) throw new Error(`Missing ${selector}`)
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom }
    }
    const detailRects = Array.from(modal.querySelectorAll('.booking-details')).map((element) => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom }
    })
    return {
      description: rect('.booking-description-card'),
      assignments: rect('.booking-assignments-card'),
      secondary: rect('.booking-secondary-grid'),
      optional: rect('.booking-optional-card'),
      attachments: rect('.attachment-card'),
      details: detailRects,
      horizontalOverflow: modal.scrollWidth > modal.clientWidth
    }
  })

  expect(layout.description.bottom).toBeLessThanOrEqual(layout.assignments.top + 1)
  expect(layout.assignments.bottom).toBeLessThanOrEqual(layout.secondary.top + 1)
  expect(layout.optional.bottom).toBeLessThanOrEqual(layout.attachments.top + 1)
  expect(layout.details[0].bottom).toBeLessThanOrEqual(layout.details[1].top + 1)
  expect(layout.horizontalOverflow).toBe(false)
  await detachedPage.screenshot({ path: 'test-results/quick-add-detached-details.png', fullPage: true })

  const detachedWindowClosed = detachedPage.waitForEvent('close')
  await detachedDialog.getByRole('button', { name: 'Schließen' }).evaluate((button: HTMLElement) => button.click()).catch(() => undefined)
  await detachedWindowClosed
})

test('distributes untouched budget amounts evenly and preserves manual values', async () => {
  await chooseBookingEntryPresentation('Dialog')
  await page.evaluate(async () => {
    for (const name of ['E2E Budget A', 'E2E Budget B', 'E2E Budget C', 'E2E Budget D']) {
      await window.api.budgets.upsert({
        year: 2026,
        sphere: 'IDEELL',
        amountPlanned: 1000,
        name
      })
    }
  })

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByLabel('Buchungen', { exact: true }).click()
  await page.locator('.fab-buchung').click()

  const dialog = page.locator('.quick-add-modal')
  await dialog.locator('input[type="number"]').first().fill('100')
  const addBudget = dialog.getByTitle('Weiteres Budget hinzufügen')
  await addBudget.click()
  await addBudget.click()

  const budgetAmounts = dialog.locator('input[title="Betrag für dieses Budget"]')
  await expect(budgetAmounts).toHaveCount(2)
  await expect(budgetAmounts.nth(0)).toHaveValue('50')
  await expect(budgetAmounts.nth(1)).toHaveValue('50')

  await addBudget.click()
  await expect(budgetAmounts).toHaveCount(3)
  await expect(budgetAmounts.nth(0)).toHaveValue('33.34')
  await expect(budgetAmounts.nth(1)).toHaveValue('33.33')
  await expect(budgetAmounts.nth(2)).toHaveValue('33.33')
  await expect(dialog.getByText(/automatisch gleichmäßig verteilt/i)).toBeVisible()
  await page.screenshot({ path: 'test-results/quick-add-budget-distribution.png', fullPage: true })

  await budgetAmounts.nth(0).fill('40')
  await addBudget.click()
  await expect(budgetAmounts).toHaveCount(4)
  await expect(budgetAmounts.nth(0)).toHaveValue('40')
  await expect(budgetAmounts.nth(1)).toHaveValue('33.33')
  await expect(budgetAmounts.nth(2)).toHaveValue('33.33')
  await expect(budgetAmounts.nth(3)).toHaveValue('0')

  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
})


test('Buchungen Plus filters, inspects and keeps the original journal available', async () => {
  await page.clock.setFixedTime(new Date('2026-09-07T12:00:00'))
  await chooseBookingEntryPresentation('Dialog')
  await page.locator('#toggle-voucher-delete-mode').check()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.evaluate(async () => {
    const bootstrap = await window.api.app.bootstrap()
    const account = bootstrap.paymentAccounts[0]
    await window.api.paymentAccounts.upsert({ id: account.id, name: 'Volksbank', kind: 'BANK', color: '#2d9c6f', isActive: true })
    const budget = await window.api.budgets.upsert({ year: 2026, sphere: 'IDEELL', name: 'Sommerprogramm', amountPlanned: 1000, color: '#26836c' })
    const earmark = await window.api.bindings.upsert({ code: 'FERIEN', name: 'Ferienfreizeit', budget: 1000, color: '#6951a0' })
    for (let index = 0; index < 23; index++) {
      await window.api.vouchers.create({ date: index === 0 ? '2026-08-18' : '2026-09-13', type: index === 1 ? 'IN' : 'OUT', sphere: 'IDEELL', budgets: index === 0 ? [{ budgetId: budget.id, amount: 75 }] : undefined, earmarks: index === 0 ? [{ earmarkId: earmark.id, amount: 75 }] : undefined, description: index === 0 ? 'Ausflug Sommerferien' : `Material Ferienprogramm ${index}`, counterparty: 'Jugendherberge', grossAmount: 75, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id, files: [{ name: 'beleg.txt', mime: 'text/plain', dataBase64: btoa('Beleg') }] })
    }
  })
  await chooseBookingView('Buchungen Plus')
  const plus = page.locator('.bookings-plus')
  await plus.getByRole('button', { name: 'Neue Buchung', exact: true }).click()
  await expect(page.locator('.quick-add-modal')).toBeVisible()
  await page.locator('.quick-add-modal').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  const expenseSummary = plus.getByRole('button', { name: 'Letzte 10 Ausgaben', exact: true })
  const summaryWidth = (await expenseSummary.boundingBox())!.width
  await expenseSummary.click()
  const expensePopover = page.getByRole('dialog', { name: 'Letzte 10 Ausgaben', exact: true })
  await expect(expensePopover.locator('.bp-recent-row')).toHaveCount(10)
  expect((await expenseSummary.boundingBox())!.width).toBe(summaryWidth)
  expect((await expensePopover.boundingBox())!.width).toBeGreaterThan(summaryWidth)
  await expensePopover.locator('.bp-recent-row').first().dblclick()
  await expect(expensePopover).toHaveCount(0)
  await expect(plus.locator('.bp-inspector')).toContainText('Material Ferienprogramm')
  await plus.getByRole('button', { name: 'Letzte 10 Einnahmen', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Letzte 10 Einnahmen', exact: true }).locator('.bp-recent-row')).toHaveCount(1)
  await page.keyboard.press('Escape')
  const paymentBadge = plus.locator('.bp-row-payment .bp-payment-badge').first()
  await expect(paymentBadge).toHaveText('Volksbank')
  const paymentLayout = await paymentBadge.evaluate(el => ({ height: el.getBoundingClientRect().height, textWidth: el.querySelector('span:last-child')!.scrollWidth, availableWidth: el.querySelector('span:last-child')!.clientWidth }))
  expect(paymentLayout.height).toBeLessThan(30)
  expect(paymentLayout.textWidth).toBeLessThanOrEqual(paymentLayout.availableWidth)
  await expect(plus.getByRole('button', { name: 'Gesamter Verlauf', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(plus.locator('.bp-days button[title]').filter({ hasText: /^13$/ })).toHaveCount(1)
  await plus.getByRole('group', { name: 'Art', exact: true }).getByRole('button', { name: 'Einnahme', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(1)
  await plus.getByRole('group', { name: 'Art', exact: true }).getByRole('button', { name: 'Einnahme', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  await page.screenshot({ path: 'test-results/bookings-plus-overview.png', animations: 'disabled' })
  await expect(plus.getByRole('button', { name: 'Zurücksetzen', exact: true })).toHaveCount(0)
  await plus.getByRole('button', { name: 'Nach Buchung sortieren', exact: true }).click()
  await expect(plus.locator('.bp-row').first()).toContainText('Ausflug Sommerferien')
  await plus.getByRole('button', { name: 'Nach Buchung sortieren, aufsteigend', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  await expect(plus.locator('.bp-row').first()).not.toContainText('Ausflug Sommerferien')
  await plus.getByRole('button', { name: 'Nach Datum sortieren', exact: true }).click()
  expect(await page.locator('.app-main').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  await expect(plus.locator('.bp-totals')).toContainText('1.650,00')
  await plus.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(3)
  await plus.getByLabel('Buchungen suchen', { exact: true }).fill('Ausflug')
  await expect(plus.locator('.bp-row')).toHaveCount(1)
  await expect(plus.locator('.bp-totals')).toContainText('75,00')
  await expect(plus.getByRole('button', { name: 'Zurücksetzen', exact: true })).toBeVisible()
  const inputBox = await plus.getByLabel('Buchungen suchen', { exact: true }).boundingBox()
  const clearIconBox = await plus.getByRole('button', { name: 'Suche leeren', exact: true }).locator('svg').boundingBox()
  expect(clearIconBox!.x + clearIconBox!.width).toBeLessThan(inputBox!.x + inputBox!.width)
  expect(clearIconBox!.y + clearIconBox!.height).toBeLessThan(inputBox!.y + inputBox!.height)
  await expect(plus.locator('.bp-row-assignments')).toContainText('Sommerprogramm')
  await expect(plus.locator('.bp-row-assignments')).toContainText('FERIEN')
  await plus.locator('.bp-row').click()
  await expect(plus.locator('.bp-inspector')).toContainText('Ausflug Sommerferien')
  const editWindowPromise = electronApp.waitForEvent('window')
  await plus.locator('.bp-inspector').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editWindow = await editWindowPromise
  await expect(editWindow.locator('#quick-add-description')).toHaveValue('Ausflug Sommerferien')
  const editClosed = editWindow.waitForEvent('close')
  await editWindow.locator('.detached-quick-add-modal').getByRole('button', { name: 'Schließen', exact: true }).click()
  await editClosed
  await plus.locator('.bp-inspector').getByRole('button', { name: 'Ähnliche Buchungen', exact: true }).click()
  await expect(plus.locator('.bp-list > .bp-similar > .btn')).toHaveCount(5)
  await expect(plus.locator('.bp-inspector .bp-similar')).toHaveCount(0)
  await expect(page.locator('.app-main')).toHaveJSProperty('scrollTop', 0)
  expect(await page.locator('.app-main').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  await plus.locator('.bp-inspector').getByRole('button', { name: '1 Beleg anzeigen / ergänzen', exact: true }).click()
  await expect(page.locator('.attachments-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(plus.locator('.bp-inspector')).toContainText('Ausflug Sommerferien')
  await plus.getByRole('button', { name: 'Zurücksetzen', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  await plus.getByRole('button', { name: 'Vorheriger Monat', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  await plus.getByRole('button', { name: 'August 2026', exact: true }).click()
  await expect(plus.getByRole('button', { name: 'August 2026', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(plus.locator('.bp-row')).toHaveCount(1)
  await plus.getByRole('button', { name: 'August 2026', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  await plus.locator('.bp-days button').filter({ hasText: /^18$/ }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/bookings-plus-desktop.png', animations: 'disabled' })
  await plus.locator('.bp-more-filters summary').click()
  await plus.getByLabel('Von', { exact: true }).fill('2026-09-01')
  await expect(plus.getByRole('alert')).toContainText('„Von“ darf nicht')
  await plus.getByRole('button', { name: 'Zurücksetzen', exact: true }).click()
  await expect(plus.locator('.bp-row')).toHaveCount(20)
  await page.setViewportSize({ width: 700, height: 900 })
  await plus.locator('.bp-row').first().click()
  const inspector = plus.getByRole('dialog', { name: 'Ausgewählte Buchung', exact: true })
  await expect(inspector).toBeVisible()
  await page.screenshot({ path: 'test-results/bookings-plus-narrow.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(inspector).toBeHidden()
  await expect(plus.locator('.bp-row').first()).toBeFocused()
  await plus.getByRole('button', { name: 'Kalender & Filter', exact: true }).click()
  await expect(plus.getByLabel('Buchungen suchen', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await plus.getByRole('button', { name: 'Kalender & Filter', exact: true }).click()
  await page.screenshot({ path: 'test-results/bookings-plus-mobile.png', animations: 'disabled' })
  expect(await plus.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await chooseBookingView('Buchungen (klassisch)')
  await expect(page.locator('.journal-view')).toBeVisible()
})


test('Buchungen Plus marks booking days with and without files beyond the first page and accepts AI file drops', async () => {
  await page.clock.setFixedTime(new Date('2026-09-07T12:00:00'))
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.evaluate(async () => {
    const account = (await window.api.app.bootstrap()).paymentAccounts[0]
    for (let index = 0; index < 103; index++) {
      await window.api.vouchers.create({ date: index === 102 ? '2026-09-15' : index === 101 ? '2026-09-14' : '2026-09-13', type: 'OUT', sphere: 'IDEELL', description: `Kalenderbeleg ${index}`, grossAmount: 1, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id, files: index === 102 ? undefined : [{ name: 'beleg.txt', mime: 'text/plain', dataBase64: btoa('Beleg') }] })
    }
  })
  await chooseBookingView('Buchungen Plus')
  const plus = page.locator('.bookings-plus')
  await expect(plus.locator('.bp-days button').filter({ hasText: /^14$/ }).locator('.bp-receipt-dot')).toHaveCount(1)
  await expect(plus.locator('.bp-days button').filter({ hasText: /^15$/ }).locator('.bp-receipt-dot')).toHaveCount(1)
  await expect(plus.locator('.bp-days button').filter({ hasText: /^16$/ }).locator('.bp-receipt-dot')).toHaveCount(0)
  await plus.getByLabel('Buchungen suchen', { exact: true }).fill('Kein Treffer')
  await expect(plus).toContainText('Keine Buchungen gefunden')
  await expect(plus.locator('.bp-days button').filter({ hasText: /^14$/ }).locator('.bp-receipt-dot')).toHaveCount(1)
  const batchDrop = await page.evaluateHandle(() => {
    const data = new DataTransfer()
    data.items.add(new File(['%PDF-1.4\n% Invoice A\n%%EOF'], 'plus-a.pdf', { type: 'application/pdf' }))
    data.items.add(new File(['%PDF-1.4\n% Invoice B\n%%EOF'], 'plus-b.pdf', { type: 'application/pdf' }))
    return data
  })
  await plus.locator('.invoice-batch-control').dispatchEvent('drop', { dataTransfer: batchDrop })
  await expect(plus.locator('.invoice-batch-flyout').getByText('plus-a.pdf', { exact: true })).toBeVisible()
  await expect(plus.locator('.invoice-batch-flyout').getByText('plus-b.pdf', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/bookings-plus-batch.png', animations: 'disabled' })
  await plus.getByRole('button', { name: 'Flyout schließen', exact: true }).click()
  const singleDrop = await page.evaluateHandle(() => {
    const data = new DataTransfer()
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), character => character.charCodeAt(0))
    data.items.add(new File([bytes], 'plus-einzelbeleg.png', { type: 'image/png' }))
    return data
  })
  await plus.locator('.invoice-batch-control').dispatchEvent('drop', { dataTransfer: singleDrop })
  await expect(page.locator('.local-invoice-scan')).toBeVisible()
  await expect(page.locator('.local-invoice-scan')).toContainText('plus-einzelbeleg.png')
})


test('Buchungen Plus shares draft tabs and the expanded editor with detached windows', async () => {
  await chooseBookingEntryPresentation('Dialog')
  await page.locator('#toggle-booking-draft-tabs').check()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await chooseBookingView('Buchungen Plus')
  const plus = page.locator('.bookings-plus')
  await plus.getByRole('button', { name: 'Neue Buchung', exact: true }).click()
  const modal = page.locator('.quick-add-modal')
  await modal.locator('#quick-add-description').fill('Entwurf Plus und Journal')
  await modal.getByRole('spinbutton', { name: 'Brutto-Betrag', exact: true }).fill('47.50')
  await expect(modal.locator('.booking-overview-amount')).toContainText('47,50')
  await modal.locator('.quick-add-form').evaluate(el => { el.scrollTop = 0 })
  const overview = await modal.locator('.booking-ai-summary').boundingBox()
  const inputs = await modal.locator('.booking-primary-grid').boundingBox()
  expect(overview!.x).toBeGreaterThan(inputs!.x + inputs!.width)
  await page.screenshot({ path: 'test-results/booking-editor-overview.png', animations: 'disabled' })
  await modal.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(modal).toHaveCount(0)
  const tab = plus.locator('.bp-draft-tabs .booking-draft-tab').filter({ hasText: 'Entwurf Plus und Journal' })
  await expect(tab).toBeVisible()
  await tab.locator('.booking-draft-tab__open').click()
  await expect(modal.locator('#quick-add-description')).toHaveValue('Entwurf Plus und Journal')
  await expect(modal.getByRole('spinbutton', { name: 'Brutto-Betrag', exact: true })).toHaveValue('47.5')
  const detachedPromise = electronApp.waitForEvent('window')
  await modal.getByRole('button', { name: 'In eigenes Fenster abdocken' }).click()
  const detached = await detachedPromise
  const editor = detached.locator('.booking-editor')
  await expect(editor.locator('#quick-add-description')).toHaveValue('Entwurf Plus und Journal')
  await expect(editor.locator('.booking-overview-amount')).toContainText('47,50')
  await expect(tab).toContainText('abgedockt')
  await detached.setViewportSize({ width: 1200, height: 900 })
  await editor.locator('.quick-add-form').evaluate(el => { el.scrollTop = 0 })
  await detached.screenshot({ path: 'test-results/booking-editor-detached-overview.png', animations: 'disabled' })
  await detached.setViewportSize({ width: 1200, height: 700 })
  await editor.locator('.booking-details').evaluateAll(details => details.forEach(detail => { (detail as HTMLDetailsElement).open = true }))
  await editor.locator('.quick-add-form').evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect.poll(() => editor.locator('.quick-add-form').evaluate(el => el.scrollTop)).toBeGreaterThan(100)
  const stickyOverview = await editor.locator('.booking-ai-summary').boundingBox()
  const formBounds = await editor.locator('.quick-add-form').boundingBox()
  const footerBounds = await editor.locator('.modal-footer-actions').boundingBox()
  expect(stickyOverview!.y).toBeGreaterThanOrEqual(formBounds!.y)
  expect(stickyOverview!.y).toBeLessThanOrEqual(formBounds!.y + 16)
  expect(stickyOverview!.y + stickyOverview!.height).toBeLessThanOrEqual(footerBounds!.y)
  await detached.screenshot({ path: 'test-results/booking-editor-sticky-overview.png', animations: 'disabled' })

  await detached.setViewportSize({ width: 850, height: 760 })
  await editor.locator('.quick-add-form').evaluate(el => { el.scrollTop = 0 })
  const narrowOverview = await editor.locator('.booking-ai-summary').boundingBox()
  const narrowKind = await editor.locator('.booking-kind-switch').boundingBox()
  expect(narrowOverview!.y + narrowOverview!.height).toBeLessThanOrEqual(narrowKind!.y)
  await detached.screenshot({ path: 'test-results/booking-editor-detached-narrow.png', animations: 'disabled' })

  const closed = detached.waitForEvent('close')
  await editor.getByRole('button', { name: 'Schließen', exact: true }).click()
  await closed
  await expect(tab).not.toContainText('abgedockt')
  await page.getByLabel('Buchungen', { exact: true }).click()
  await expect(page.locator('.booking-draft-tab').filter({ hasText: 'Entwurf Plus und Journal' })).toBeVisible()
})


test('Buchungen Plus scrolls the filter card while keeping the calendar visible', async () => {
  await page.setViewportSize({ width: 1600, height: 760 })
  await chooseBookingView('Buchungen Plus')
  const plus = page.locator('.bookings-plus')
  await plus.locator('.bp-more-filters summary').click()
  const calendar = plus.locator('.bp-calendar')
  const filters = plus.locator('.bp-filters')
  const before = await calendar.boundingBox()
  await filters.evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect.poll(() => filters.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  const after = await calendar.boundingBox()
  expect(after!.y).toBe(before!.y)
  expect(after!.height).toBe(before!.height)
  expect(after!.y).toBeGreaterThanOrEqual(0)
  await expect(plus.locator('.bp-sidebar')).toHaveJSProperty('scrollTop', 0)
  expect(await page.locator('.app-main').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/bookings-plus-filter-scroll.png', animations: 'disabled' })
})


test('Buchungen Plus protects booking data and edits metadata in the inspector', async () => {
  await chooseBookingEntryPresentation('Dialog')
  await expect(page.locator('#toggle-voucher-delete-mode')).not.toBeChecked()
  await page.setViewportSize({ width: 1600, height: 1000 })
  const fixture = await page.evaluate(async () => {
    const bootstrap = await window.api.app.bootstrap()
    const account = bootstrap.paymentAccounts[0]
    const budget = await window.api.budgets.upsert({ year: 2026, sphere: 'IDEELL', name: 'Metadatenbudget', amountPlanned: 1000 })
    const earmark = await window.api.bindings.upsert({ code: 'META', name: 'Metadatenzweck', budget: 1000 })
    const voucher = await window.api.vouchers.create({ date: '2026-09-07', type: 'OUT', sphere: 'IDEELL', description: 'Geschützte Buchung', counterparty: 'Testpartner', grossAmount: 75, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id, note: 'Originalnotiz' })
    const result = await window.api.vouchers.list({ limit: 1, voucherIds: [voucher.id] })
    return { id: voucher.id, budget: budget.id, earmark: earmark.id, before: result.rows[0] }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Später', exact: true }).click()
  await chooseBookingView('Buchungen Plus')
  const plus = page.locator('.bookings-plus')
  await expect(plus.locator('.bp-row')).toHaveCount(1)
  await plus.getByRole('button', { name: 'Belegnummer kopieren', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(fixture.before.voucherNo)
  const windowCount = electronApp.windows().length
  await plus.locator('.bp-inspector').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = plus.locator('.voucher-info-embedded')
  await expect(editor).toBeVisible()
  expect(electronApp.windows().length).toBe(windowCount)
  await expect(page.locator('.quick-add-modal')).toHaveCount(0)
  await expect(editor.locator('input[type="date"]')).toHaveCount(0)
  await editor.locator('#voucher-info-note').fill('Notiz geändert')
  await editor.getByRole('button', { name: 'Anhang hinzufügen', exact: true }).click()
  await expect(page.locator('.attachments-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor.locator('#voucher-info-note')).toHaveValue('Notiz geändert')

  await editor.getByRole('button', { name: '+ Budget', exact: true }).click()
  const budget = editor.locator('.voucher-info-assignment-editor').first()
  await budget.getByRole('button', { name: 'Budget wählen', exact: true }).click()
  await page.getByRole('listbox').getByRole('option', { name: 'Metadatenbudget', exact: true }).click()
  await budget.locator('input').fill('80')
  await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled()
  await budget.locator('input').fill('50')
  await editor.getByRole('button', { name: '+ Zweckbindung', exact: true }).click()
  const earmark = editor.locator('.voucher-info-assignment-editor').nth(1)
  await earmark.getByRole('button', { name: 'Zweckbindung wählen', exact: true }).click()
  await page.getByRole('listbox').getByRole('option', { name: 'META - Metadatenzweck', exact: true }).click()
  await earmark.locator('input').fill('25')
  await page.screenshot({ path: 'test-results/bookings-plus-metadata-editor.png', animations: 'disabled' })
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(plus.locator('.bp-inspector')).toContainText('Notiz geändert')
  const saved = await page.evaluate(async id => (await window.api.vouchers.list({ limit: 1, voucherIds: [id] })).rows[0], fixture.id)
  expect(saved.note).toBe('Notiz geändert')
  expect(saved.budgets?.[0]).toMatchObject({ budgetId: fixture.budget, amount: 50 })
  expect(saved.earmarksAssigned?.[0]).toMatchObject({ earmarkId: fixture.earmark, amount: 25 })
  for (const key of ['date', 'type', 'sphere', 'description', 'counterparty', 'grossAmount', 'netAmount', 'vatRate', 'paymentAccountId', 'voucherNo'] as const) expect(saved[key]).toBe(fixture.before[key])
  const backupReminder = page.getByRole('dialog').filter({ hasText: 'Automatische Sicherung' })
  if (await backupReminder.isVisible()) await backupReminder.getByRole('button', { name: 'Später', exact: true }).click()
  await plus.getByRole('button', { name: 'Vollständige Buchungsinfo', exact: true }).click()
  const info = page.locator('.voucher-info-modal-overlay')
  await expect(info.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeVisible()
  await expect(info.getByRole('button', { name: 'Stornieren', exact: true })).toBeVisible()
  await info.getByRole('button', { name: 'Schließen', exact: true }).click()
  await plus.locator('.bp-inspector').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await editor.locator('#voucher-info-note').fill('Nicht speichern')
  await editor.getByRole('button', { name: '+ Budget', exact: true }).click()
  await expect(editor.locator('.voucher-info-assignment-editor')).toHaveCount(3)
  await editor.getByRole('button', { name: 'Budgetzuordnung entfernen', exact: true }).last().click()
  await expect(editor.locator('.voucher-info-assignment-editor')).toHaveCount(2)

  await editor.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(plus.locator('.bp-inspector')).toContainText('Notiz geändert')
})


test('Dashboard Plus shows real monthly balances and a responsive five-card overview', async () => {
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const dashboard = page.getByRole('region', { name: 'Dashboard', exact: true })
  await expect(dashboard.locator('.dp-grid > .dp-card')).toHaveCount(5)
  await expect(dashboard.locator('.dp-balance-value > strong')).toContainText('0,00')
  const fixture = await page.evaluate(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date(`${today}T12:00:00Z`)
    const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1)).toISOString().slice(0, 10))
    const account = (await window.api.app.bootstrap()).paymentAccounts[0]
    const oldDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 17, 1)).toISOString().slice(0, 10)
    await window.api.vouchers.create({ date: oldDate, type: 'IN', sphere: 'IDEELL', description: 'Historischer Anfangsbestand', grossAmount: 1000, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id })
    const budget = await window.api.budgets.upsert({ year: now.getUTCFullYear(), sphere: 'IDEELL', name: 'Jugendarbeit', amountPlanned: 5000 })
    const binding = await window.api.bindings.upsert({ code: 'JUGEND', name: 'Jugendförderung', budget: 1000, color: '#6951a0' })
    await window.api.settings.set({ key: 'org.logoDataUrl', value: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" rx="12" fill="#a5a5d5"/><text x="60" y="38" text-anchor="middle" font-size="24" fill="white">Verein</text></svg>') })
    let balance = 1000
    for (let index = 0; index < months.length; index++) {
      const income = 1600 + index * 110
      const expense = 1000 + index * 50
      for (const [type, amount] of [['IN', income], ['OUT', expense]] as const) {
        await window.api.vouchers.create({ date: months[index], type, sphere: 'IDEELL', description: `Dashboard ${type} ${index}`, earmarks: index === 11 ? [{ earmarkId: binding.id, amount: type === 'IN' ? 100 : 300 }] : undefined, budgets: index === 11 && type === 'OUT' ? [{ budgetId: budget.id, amount: 300 }] : undefined, grossAmount: amount, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id })
      }
      balance += income - expense
    }
    const future = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
    await window.api.vouchers.create({ date: future, type: 'IN', sphere: 'IDEELL', description: 'Noch nicht eingegangen', grossAmount: 999999, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id })
    for (let index = 0; index < 12; index++) await window.api.members.create({ memberNo: `DP-${index}`, name: `Testmitglied ${index}`, status: index < 9 ? 'ACTIVE' : 'PAUSED', join_date: months[0] })
    await window.api.invoices.create({ date: months[10], dueDate: months[10], party: 'Testlieferant', grossAmount: 340, sphere: 'IDEELL', voucherType: 'OUT', autoPost: false })
    window.api.app.notifyDataChanged(['vouchers', 'members', 'invoices'])
    return { balance, month: today.slice(0, 7), previousMonth: months[10].slice(0, 7) }
  })
  const reminder = page.getByRole('dialog').filter({ hasText: 'Automatische Sicherung' })
  await reminder.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined)
  if (await reminder.isVisible()) await reminder.getByRole('button', { name: 'Später', exact: true }).click()
  await expect(dashboard.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(dashboard.getByRole('img', { name: 'Organisationslogo' })).toBeVisible()
  await expect(dashboard.locator('.dp-balance-value > strong')).toContainText(new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2 }).format(fixture.balance))
  await expect(dashboard.locator('.dp-month')).toHaveCount(18)
  await expect(dashboard.locator('.dp-budget-tile')).toContainText('Jugendarbeit')
  const assignmentSwitch = dashboard.getByRole('group', { name: 'Budgets oder Zweckbindungen' })
  await assignmentSwitch.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await expect(dashboard.locator('.dp-budget-tile')).toContainText('Jugendförderung')
  await expect(dashboard.locator('.dp-budget-tile > b')).toHaveText('200,00 €')
  await expect(dashboard.locator('.dp-budget-tile')).toContainText('Einnahmen 100,00 €')
  await expect(dashboard.locator('.dp-budget-tile')).toContainText('Ausgaben 300,00 €')
  await dashboard.locator('.dp-budget-overview').screenshot({ path: 'test-results/dashboard-plus-bindings.png' })
  await assignmentSwitch.getByRole('button', { name: 'Budgets', exact: true }).click()
  await expect(dashboard.locator('.dp-budget-tile')).toContainText('Jugendarbeit')
  await expect(dashboard.locator('.dp-budget-tile')).toContainText('300,00')
  await expect(dashboard.locator('.dp-distribution')).toContainText('Sphären')
  await expect(dashboard.locator('.dp-distribution > .dp-open-value')).toHaveText('15.300,00 €')
  const stacked = dashboard.getByRole('article', { name: 'Gestapelte Monatsentwicklung' })
  await stacked.getByRole('button', { name: 'Ausgaben', exact: true }).click()
  await expect(stacked.locator('.dp-stack-total')).toHaveText('15.300,00 €')
  await stacked.getByRole('button', { name: 'Tags', exact: true }).click()
  await expect(stacked.locator('.dp-stack-legend')).toContainText('Ohne Tag')
  await stacked.scrollIntoViewIfNeeded()
  await stacked.screenshot({ path: 'test-results/dashboard-plus-stacked.png' })
  await expect(dashboard.locator('.dp-distribution-list')).toContainText('100 %')
  await dashboard.getByLabel('Monat der Ausgabendeckung').selectOption(fixture.previousMonth)
  await expect(dashboard.locator('.dp-coverage')).toContainText('1.200,00')
  await dashboard.getByLabel('Monat der Ausgabendeckung').selectOption('period')
  await expect(dashboard.locator('.dp-coverage')).toContainText('12.160,00')
  await dashboard.getByRole('button', { name: '6M', exact: true }).click()
  await expect(dashboard.locator('.dp-month')).toHaveCount(6)
  await dashboard.locator('.dp-month').last().hover()
  await expect(page.getByRole('tooltip')).toContainText('2.810,00')
  await dashboard.locator('.dp-balance-targets button').last().hover()
  await expect(page.getByRole('tooltip')).toContainText('12.160,00')
  await dashboard.getByRole('heading', { name: 'Dashboard', exact: true }).hover()
  await expect(dashboard.locator('.dp-members')).toContainText('9')
  await expect(dashboard.locator('.dp-open')).toContainText('340,00')
  await dashboard.locator('.dp-month').first().click()
  await expect(dashboard.locator('.dp-month').first()).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'test-results/dashboard-plus-overview.png', fullPage: true })
  await dashboard.getByRole('button', { name: '12M', exact: true }).click()
  await expect(dashboard.locator('.dp-month')).toHaveCount(12)
  await expect(dashboard.getByRole('tab', { name: 'Cashflow', exact: true })).toHaveCount(0)
  await stacked.getByRole('button', { name: 'Tabelle', exact: true }).click()
  await expect(stacked.locator('tbody tr')).toHaveCount(9)
  await stacked.getByRole('button', { name: 'Vorheriges Jahr' }).click()
  await expect(stacked.locator('tbody tr')).toHaveCount(3)
  await stacked.getByRole('button', { name: 'Nächstes Jahr' }).click()
  await expect(stacked.locator('tbody tr')).toHaveCount(9)
  await stacked.screenshot({ path: 'test-results/dashboard-plus-year-table.png' })
  await stacked.getByRole('button', { name: 'Diagramm', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dashboard.locator('.dp-grid > .dp-card')).toHaveCount(5)
  expect(await dashboard.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/dashboard-plus-mobile.png', fullPage: true })
  await dashboard.locator('.dp-open').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/dashboard-plus-mobile-bottom.png', fullPage: true })
  await page.locator('.app-main').evaluate(el => { el.scrollTop = 0 })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); document.documentElement.setAttribute('data-color-theme', 'soft-blush') })
  await page.screenshot({ path: 'test-results/dashboard-plus-light.png', fullPage: true })
  await dashboard.locator('.dp-insights').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/dashboard-plus-insights.png', fullPage: true })
  await dashboard.getByRole('tab', { name: 'Letzte Aktionen' }).click()
  await expect(dashboard.locator('.dp-activity tbody tr')).not.toHaveCount(0)
  await page.screenshot({ path: 'test-results/dashboard-plus-activity.png', fullPage: true })
  await dashboard.getByRole('button', { name: 'Buchung öffnen' }).first().click()
  await expect(page.locator('.journal-table')).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(dashboard.getByRole('button', { name: 'KI einrichten' })).toBeVisible()
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai.settings.get')
    ipcMain.handle('ai.settings.get', () => ({ hasApiKey: true }))
    ipcMain.removeHandler('ai.text.generate')
    ipcMain.handle('ai.text.generate', (_event, payload) => {
      if (payload.type !== 'REPORT_TEXT' || !payload.prompt.includes('months') || !payload.prompt.includes('Wie steht der Verein da?')) throw new Error('Dashboard-Kontext fehlt')
      return { title: 'Finanzlage des Vereins', body: 'Der gebuchte Bestand beträgt 12.160,00 Euro.', notes: ['Offene Posten sind getrennt ausgewiesen.'] }
    })
  })
  await page.evaluate(() => window.api.app.notifyDataChanged(['settings']))
  await reminder.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined)
  if (await reminder.isVisible()) await reminder.getByRole('button', { name: 'Später', exact: true }).click()
  await dashboard.getByLabel('Frage zu Reporting oder Controlling').fill('Wie steht der Verein da?')
  await dashboard.getByRole('button', { name: 'Frage senden', exact: true }).click()
  await expect(dashboard.locator('.dp-ai-answers')).toContainText('12.160,00 Euro')
  await dashboard.getByRole('button', { name: 'Neuer Chat' }).click()
  await expect(dashboard.locator('.dp-ai-answers')).toHaveCount(0)
  await expect(dashboard.getByRole('textbox', { name: 'Frage zu Reporting oder Controlling' })).toHaveValue('')
  await dashboard.locator('.dp-assistant').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/dashboard-plus-assistant.png', fullPage: true })
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(dashboard).toBeVisible()
})


test('Dashboard Plus uses organization categories for expense distribution', async () => {
  await page.evaluate(async () => {
    await window.api.classifications.profile.update({ profile: 'GENERAL' })
    const category = await window.api.classifications.primary.create({ name: 'Veranstaltungen', color: '#91bdc5' })
    const account = (await window.api.app.bootstrap()).paymentAccounts[0]
    await window.api.vouchers.create({ date: new Date().toISOString().slice(0, 10), type: 'OUT', sphere: 'IDEELL', primaryClassificationValueId: category.id, description: 'Raummiete', grossAmount: 125, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id })
    window.api.app.notifyDataChanged(['vouchers', 'settings'])
  })
  await page.reload()
  const later = page.getByRole('button', { name: 'Später', exact: true })
  await later.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined)
  if (await later.isVisible()) await later.click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const dashboard = page.getByRole('region', { name: 'Dashboard', exact: true })
  await expect(dashboard.locator('.dp-distribution')).toContainText('Kategorien')
  await expect(dashboard.locator('.dp-distribution-list')).toContainText('Veranstaltungen')
  await expect(dashboard.locator('.dp-distribution > .dp-open-value')).toHaveText('125,00 €')
  await expect(dashboard.locator('.dp-members')).toContainText('Konten im Überblick')
})

test('Unchanged voucher saves do not create recent activity', async () => {
  const result = await page.evaluate(async () => {
    const bootstrap = await window.api.app.bootstrap()
    const account = bootstrap.paymentAccounts[0]
    const voucher = await window.api.vouchers.create({ date: '2026-09-07', type: 'OUT', sphere: 'IDEELL', description: 'Audit Vergleich', grossAmount: 75, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id })
    const count = async () => (await window.api.audit.recent({ limit: 100 })).rows.filter(row => row.entityId === voucher.id && row.entity === 'vouchers' && ['UPDATE_META', 'UPDATE'].includes(row.action)).length
    const before = await count()
    await window.api.vouchers.updateMeta({ id: voucher.id, note: '', budgets: [], earmarks: [], tags: [] })
    await window.api.vouchers.update({ id: voucher.id, description: 'Audit Vergleich' })
    const unchanged = await count()
    await window.api.vouchers.updateMeta({ id: voucher.id, note: 'Echte Änderung' })
    const changed = await count()
    await window.api.vouchers.updateMeta({ id: voucher.id, note: 'Echte Änderung', budgets: [], earmarks: [], tags: [] })
    return { before, unchanged, changed, repeated: await count() }
  })
  expect(result.unchanged).toBe(result.before)
  expect(result.changed).toBe(result.before + 1)
  expect(result.repeated).toBe(result.changed)
})


test('booking view preference persists and resolves dashboard and receipt links', async () => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  const voucher = await page.evaluate(async () => {
    const { paymentAccounts } = await window.api.app.bootstrap()
    const account = paymentAccounts[0]
    return window.api.vouchers.create({ date: '2026-09-08', type: 'OUT', sphere: 'IDEELL', description: 'Ansicht Verweistest', files: [{ name: 'beleg.txt', mime: 'text/plain', dataBase64: btoa('Beleg') }], grossAmount: 42, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id })
  })
  await chooseBookingView('Buchungen Plus')
  await expect(page.locator('.bookings-plus')).toBeVisible()
  await page.reload()
  await expect(page.locator('.bookings-plus')).toBeVisible()
  const later = page.getByRole('button', { name: 'Später', exact: true })
  await later.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  if (await later.isVisible()) await later.click()
  await expect(page.getByRole('button', { name: 'Dashboard Plus', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buchungen Plus', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const dashboard = page.getByRole('region', { name: 'Dashboard', exact: true })
  await expect(dashboard).toBeVisible()
  await expect(dashboard.locator('.dp-preview')).toHaveCount(0)
  await dashboard.getByRole('tab', { name: 'Letzte Aktionen' }).click()
  await dashboard.getByRole('button', { name: 'Buchung öffnen' }).first().click()
  await expect(page.locator('.bookings-plus .bp-row')).toHaveCount(1)
  await expect(page.locator('.bp-inspector')).toContainText('Ansicht Verweistest')
  await page.getByRole('button', { name: 'Belege', exact: true }).click()
  await page.getByTitle('Zur Buchung', { exact: true }).click()
  await expect(page.locator('.bookings-plus .bp-row')).toHaveCount(1)
  await expect(page.locator('.bp-inspector')).toContainText('Ansicht Verweistest')
  await page.locator('.bp-reset-badge').click()
  await expect(page.locator('.bp-search input')).toHaveValue('')
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByLabel('Buchungen', { exact: true }).click()
  await expect(page.locator('.bp-search input')).toHaveValue('')
  await expect(page.locator('.bp-reset-badge')).toHaveCount(0)
  await expect(page.locator('.bp-preview-label')).toHaveCount(0)
  await expect(page.locator('.bp-heading')).not.toContainText('Alle Buchungen im Blick')
  // A new receipt link must still apply its filter after the previous one was reset.
  await page.getByRole('button', { name: 'Belege', exact: true }).click()
  await page.getByTitle('Zur Buchung', { exact: true }).click()
  await expect(page.locator('.bp-search input')).not.toHaveValue('')
  await page.locator('.bp-search input').fill('keine Treffer')
  await expect(page.locator('.bookings-plus .bp-row')).toHaveCount(0)
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: id } })), voucher.id)
  await expect(page.locator('.bookings-plus .bp-row')).toHaveCount(1)
  await chooseBookingView('Buchungen (klassisch)')
  await expect(page.locator('.journal-view')).toBeVisible()
  await page.getByRole('button', { name: 'Belege', exact: true }).click()
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: id } })), voucher.id)
  await expect(page.locator('.journal-view')).toContainText('Ansicht Verweistest')
})


test('advances search and status filters show matching recipients and a clear detail view', async () => {
  await page.setViewportSize({ width: 1500, height: 960 })
  await page.evaluate(async () => {
    await window.api.advances.create({ recipientName: 'Merle Beckord', issuedAt: '2026-09-01', amount: 500, notes: 'Ferienprogramm Material' })
    await window.api.advances.create({ recipientName: 'Nikolas Häfner', issuedAt: '2026-08-11', amount: 1000 })
    const completed = await window.api.advances.create({ recipientName: 'Julia Lehmann', issuedAt: '2026-08-01', amount: 250, notes: 'Sommerausflug' })
    await window.api.advances.resolve({ id: completed.id })
    const byName = await window.api.advances.list({ q: 'Merle', status: 'OPEN' })
    if (byName.total !== 1) throw new Error('Name search did not return one open advance')
    const byNote = await window.api.advances.list({ q: 'Sommerausflug', status: 'RESOLVED' })
    if (byNote.total !== 1) throw new Error('Note and resolved status search failed')
    const combined = await window.api.advances.list({ q: 'Merle', status: 'RESOLVED' })
    if (combined.total !== 0) throw new Error('Status filter returned an open advance')
  })
  await page.getByRole('button', { name: 'Vorschüsse', exact: true }).click()
  const recipients = page.locator('.advances-recipient-row')
  const search = page.getByRole('textbox', { name: 'Vorschüsse durchsuchen' })
  const status = page.getByRole('button', { name: 'Status filtern' })
  await expect(recipients).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'Ausgewählter Vorschuss' })).toContainText('Merle Beckord')
  await expect(page.locator('.advances-page')).not.toContainText('Ablauf eines Vorschusses')
  await search.fill('Niko')
  await expect(recipients).toHaveCount(1)
  await expect(recipients).toContainText('Nikolas Häfner')
  await expect(page.locator('.advances-person h2')).toHaveText('Nikolas Häfner')
  await status.click()
  await page.getByRole('option', { name: 'Erledigt', exact: true }).click()
  await expect(recipients).toHaveCount(0)
  await expect(page.locator('.advances-person-card')).toHaveCount(0)
  await search.fill('Sommerausflug')
  await expect(recipients).toHaveCount(1)
  await expect(recipients).toContainText('Julia Lehmann')
  await expect(page.locator('.advances-person-card')).toContainText('Erledigt')
  await expect(page.getByRole('button', { name: 'Auflösen', exact: true })).toBeDisabled()
  await search.fill('')
  await status.click()
  await page.getByRole('option', { name: 'Alle', exact: true }).click()
  await expect(recipients).toHaveCount(3)
  await recipients.filter({ hasText: 'Merle Beckord' }).click()
  await expect(page.locator('.advances-person h2')).toHaveText('Merle Beckord')
  await expect(page.locator('.advances-note')).toContainText('Ferienprogramm Material')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: 'test-results/advances-redesign-dark.png', fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.screenshot({ path: 'test-results/advances-redesign-light.png', fullPage: true })
  await page.setViewportSize({ width: 600, height: 900 })
  await page.screenshot({ path: 'test-results/advances-redesign-narrow.png', fullPage: true })
  expect(await page.locator('.advances-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await recipients.filter({ hasText: 'Nikolas Häfner' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.advances-person h2')).toHaveText('Nikolas Häfner')
  await page.getByRole('button', { name: '+ Buchung', exact: true }).click()
  await expect(page.locator('.advances-purchase-flyout-anchor')).toBeVisible()
})


test('advances show spending progress, colored purchase rows and compact creation', async () => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  const advanceId = await page.evaluate(async () => {
    const { paymentAccounts } = await window.api.app.bootstrap()
    const account = paymentAccounts[0]
    const budget = await window.api.budgets.upsert({ year: 2026, sphere: 'IDEELL', name: 'Sommerprogramm', amountPlanned: 2000, color: '#26836c' })
    const binding = await window.api.bindings.upsert({ code: 'FERIEN', name: 'Ferienfreizeit', budget: 2000, color: '#6951a0' })
    const advance = await window.api.advances.create({ recipientName: 'Merle Beckord', issuedAt: '2026-09-01', amount: 500 })
    await window.api.advances.purchases.create({ advanceId: advance.id, date: '2026-09-08', type: 'OUT', sphere: 'IDEELL', description: 'Würstchen zum Grillen', grossAmount: 100, vatRate: 0, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK', paymentAccountId: account.id, budgets: [{ budgetId: budget.id, amount: 100 }], earmarks: [{ earmarkId: binding.id, amount: 100 }], files: [{ name: 'beleg.txt', mime: 'text/plain', dataBase64: btoa('Beleg') }] })
    return advance.id
  })
  await page.getByRole('button', { name: 'Vorschüsse', exact: true }).click()
  const progress = page.getByRole('progressbar', { name: 'Ausgegeben: Merle Beckord' })
  await expect(progress).toHaveAttribute('value', '100')
  await expect(progress).toHaveAttribute('max', '500')
  const purchase = page.locator('.advance-purchase')
  await expect(purchase).toContainText('Würstchen zum Grillen')
  await expect(purchase).toContainText('Sommerprogramm')
  await expect(purchase).toContainText('FERIEN')
  await expect(purchase.locator('.advance-purchase-files')).toContainText('1')
  expect(await page.locator('.advances-page').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await purchase.getByRole('button', { name: 'Buchung bearbeiten' }).click()
  await expect(page.locator('.advances-purchase-flyout-anchor')).toBeVisible()
  await page.getByRole('button', { name: 'Buchungsflyout schließen' }).click()
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: 'test-results/advances-purchase-rows.png', fullPage: true })
  await page.getByRole('button', { name: '+ Vorschuss', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Vorschuss erfassen', exact: true })
  await expect(create.locator('.compact-booking-popup')).toBeVisible()
  await expect(create.locator('#advance-recipient')).toBeFocused()
  await create.locator('#advance-recipient').fill('Nikolas Häfner')
  await create.locator('#advance-amount').fill('1000')
  await expect(create.getByLabel('Notiz', { exact: true })).toBeHidden()
  await page.screenshot({ path: 'test-results/advances-create-flyout.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(create).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ Vorschuss', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '+ Vorschuss', exact: true }).click()
  await expect(create.locator('#advance-recipient')).toHaveValue('Nikolas Häfner')
  await create.locator('summary').click()
  await create.getByLabel('Notiz', { exact: true }).fill('Material für das Jugendhaus')
  await create.getByRole('button', { name: 'Vorschuss erfassen', exact: true }).click()
  await expect(create).toHaveCount(0)
  await expect(page.locator('.advances-person h2')).toHaveText('Nikolas Häfner')
  await expect(page.locator('.advances-note')).toContainText('Material für das Jugendhaus')
  const reminder = page.getByRole('button', { name: 'Später', exact: true })
  if (await reminder.isVisible()) await reminder.click()
  await page.locator('.advances-recipient-row').filter({ hasText: 'Merle Beckord' }).click()
  await page.setViewportSize({ width: 600, height: 900 })
  await expect(purchase).toBeVisible()
  expect(await page.locator('.advances-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await purchase.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/advances-purchase-rows-narrow.png' })
  await page.evaluate(async id => {
    await window.api.advances.resolve({ id })
    const result = await window.api.advances.list({ status: 'RESOLVED', q: 'Merle' })
    if (result.rows[0]?.spentAmount !== 100) throw new Error('Resolved advance lost its spending progress')
  }, advanceId)
})
