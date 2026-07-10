import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let electronApp: ElectronApplication
let page: Page
let userDataDir: string

test.beforeAll(async () => {
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
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
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

test('presents the optimized booking workflow', async () => {
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  await laterButton.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined)
  if (await laterButton.isVisible()) await laterButton.click()
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
  await expect(dialog.getByText('Tags', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Kommentar', { exact: true })).toBeVisible()

  expect(await dialog.locator('input[type="date"]').evaluate(
    (input) => getComputedStyle(input).appearance
  )).toBe('none')
  await expect(dialog.getByRole('button', { name: 'Kalender zur Datumsauswahl öffnen' })).toBeVisible()
  const calendarIcon = dialog.locator('.booking-date-icon')
  await expect(calendarIcon).toBeVisible()
  expect(await calendarIcon.evaluate((icon) => getComputedStyle(icon).color)).not.toBe('rgb(0, 0, 0)')

  const sphereInfo = dialog.getByRole('button', { name: 'Erklärung zu den steuerlichen Bereichen' })
  await sphereInfo.hover()
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
  await expect(dialog.getByRole('combobox', { name: 'Transfer von Konto' })).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Sphäre der Buchung' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
})

test('keeps expanded tags and comments separated in the detached booking window', async () => {
  await page.setViewportSize({ width: 1200, height: 780 })
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  if (await laterButton.isVisible()) await laterButton.click()
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
  await detachedDialog.getByRole('button', { name: 'Schließen' }).click()
  await detachedWindowClosed
})

test('distributes untouched budget amounts evenly and preserves manual values', async () => {
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
