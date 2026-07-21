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
  return page.getByRole('group', { name: 'Darstellung der Buchungserfassung' })
}

async function chooseBookingEntryPresentation(name: 'Dialog' | 'Kompakt-Flyout' | 'Eigenes Fenster') {
  const presentation = await openBookingWorkflowSettings()
  const option = presentation.getByRole('button', { name, exact: true })
  await option.click()
  await expect(option).toHaveClass(/\bactive\b/)
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

test('starts the real Electron app with its preload bridge', async () => {
  await expect(page).toHaveTitle(/VereinO/i)
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()

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
  await expect(page.locator('.dashboard-card').first()).toBeVisible()

  const laterAfterDashboard = page.getByRole('button', { name: 'Später', exact: true })
  if (await laterAfterDashboard.isVisible()) await laterAfterDashboard.click()
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Suche', exact: true })).toBeVisible()
})

test('selects a single invoice in a compact flyout before opening recognition', async () => {
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()

  await page.locator('.invoice-split-fab__new').click()
  const uploadFlyout = page.locator('.invoice-single-upload-flyout')
  await expect(uploadFlyout).toBeVisible()
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
  await expect(recognitionDialog.getByText('einzelrechnung.png', { exact: true })).toBeVisible()
})

test('queues batch invoices in the Submit folder and exposes the review flyout', async () => {
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  await laterButton.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
  if (await laterButton.isVisible()) await laterButton.click()
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()

  const splitControl = page.locator('.invoice-split-fab')
  await expect(splitControl).toBeVisible()
  await expect(splitControl.locator('button')).toHaveCount(2)
  await splitControl.locator('.invoice-split-fab__batch').click()
  const flyout = page.locator('.invoice-batch-flyout')
  await expect(flyout).toBeVisible()
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
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  const totalCards = page.locator('.filter-totals-stat')
  await expect(totalCards).toHaveCount(3)
  const totalCardBackgrounds = await totalCards.evaluateAll((cards) =>
    cards.map((card) => getComputedStyle(card).backgroundColor)
  )
  expect(totalCardBackgrounds).toHaveLength(3)
  expect(totalCardBackgrounds).not.toContain('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: 'test-results/journal-surface-hierarchy.png', fullPage: true })
  await page.locator('.fab-buchung').click()

  const dialog = page.locator('.quick-add-modal')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Einnahme', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ausgabe', exact: true })).toBeVisible()
  await expect(dialog.getByPlaceholder(/Was wurde gebucht/i)).toBeVisible()
  await expect(dialog.getByText('Zuordnungen', { exact: true })).toBeVisible()
  const attachmentCard = dialog.locator('.attachment-card')
  const attachmentActions = attachmentCard.locator('.attachment-actions--header')
  await expect.poll(() => attachmentActions.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await attachmentCard.hover()
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
  await expect(dialog.getByRole('button', { name: 'Transfer von Konto' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Sphäre der Buchung' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
})

test('routes new bookings through the configured dialog, flyout, and detached window', async () => {
  await chooseBookingEntryPresentation('Dialog')

  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  await page.locator('.fab-buchung').click()
  const dialog = page.locator('.quick-add-modal')
  await expect(dialog).toBeVisible()
  await expect(page.locator('.compact-booking-flyout')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()

  await chooseBookingEntryPresentation('Kompakt-Flyout')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ui.bookingEntryPresentation'))).toBe('flyout')
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  await page.locator('.fab-buchung').click()
  const flyout = page.locator('.compact-booking-flyout')
  await expect(flyout).toBeVisible()
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
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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

  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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

  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
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
