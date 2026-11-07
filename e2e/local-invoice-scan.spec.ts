import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
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

test.beforeAll(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-local-invoice-e2e-'))
  const launchEnv = { ...process.env }
  delete launchEnv.ELECTRON_RUN_AS_NODE

  electronApp = await electron.launch({
    args: [path.resolve('dist-electron/main/index.cjs'), `--user-data-dir=${userDataDir}`],
    env: {
      ...launchEnv,
      ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString(),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  page = await waitForVereinOWindow(electronApp)
  // The first window initially contains the startup screen. The invoice test
  // needs the fully initialized renderer and its IPC-backed database.
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 })
  const later = page.getByRole('button', { name: 'Später', exact: true })
  await page.addLocatorHandler(later, () => later.click())
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
  }
  if (userDataDir) {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
})

async function createInvoicePdf() {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const pdfPage = document.addPage([595, 842])
  const lines = [
    'RECHNUNG',
    'Auto Teile Europa GmbH',
    'Rechnungsnummer: DE-001',
    'Rechnungsdatum: 01.01.2024',
    'Zahlbar bis: 15.01.2024',
    'Summe Netto 520,00 EUR',
    'MwSt. 19,0 % 98,80 EUR',
    'Gesamtbetrag 618,80 EUR',
    'IBAN: DE89 3704 0044 0532 0130 00'
  ]

  lines.forEach((line, index) => {
    pdfPage.drawText(line, {
      x: 54,
      y: 780 - index * 34,
      size: index === 0 ? 20 : 12,
      font
    })
  })
  return Buffer.from(await document.save())
}

test('receipt widget drops a PDF, preserves fields across modes and saves an open invoice', async () => {
  await page.evaluate(() => window.api.paymentAccounts.upsert({ name: 'Beleg Testbank', kind: 'BANK' }))
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Belegwidget öffnen', exact: true })).toHaveCount(0)
  await page.locator('.settings-subnav').getByTitle('Arbeitsweise', { exact: true }).click()
  await expect(page.getByRole('switch', { name: /Beim Anmelden automatisch starten/ })).toBeDisabled()
  await page.screenshot({ path: 'test-results/settings-workflow.png', animations: 'disabled' })
  const widgetPromise = electronApp.waitForEvent('window')
  await page.getByRole('button', { name: 'Belegwidget öffnen', exact: true }).click()
  const widget = await widgetPromise
  await expect(widget.getByRole('button', { name: 'Belegwidget aufklappen' })).toBeVisible()
  await expect.poll(() => widget.evaluate(() => window.innerWidth)).toBe(44)
  await widget.screenshot({ path: 'test-results/receipt-widget-droplet.png' })
  await widget.getByRole('button', { name: 'Belegwidget aufklappen' }).click()
  await expect(widget.getByRole('button', { name: /Beleg ablegen/ })).toBeVisible()
  await expect.poll(() => widget.evaluate(() => window.innerWidth)).toBe(300)
  await widget.screenshot({ path: 'test-results/receipt-widget.png', animations: 'disabled' })
  await widget.locator('input[type="file"]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await expect(widget.getByRole('alert')).toContainText('PDF oder Bild')

  await widget.getByRole('button', { name: 'Belegwidget aufklappen' }).click()
  await expect.poll(() => widget.evaluate(() => window.innerWidth)).toBe(44)
  await widget.locator('.receipt-widget').evaluate(element => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['test'], 'test.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect.poll(() => widget.evaluate(() => window.innerWidth)).toBe(300)
  const intakePromise = electronApp.waitForEvent('window')
  const pdf = Array.from(await createInvoicePdf())
  await widget.locator('.receipt-widget').evaluate((element, bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'Beige_und_Braun_Elegant_Einfach_Cafe_Rechnung_A4_Dokument_mit_besonders_langem_Dateinamen_2026.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, pdf)
  const intake = await intakePromise
  await expect(intake.getByLabel('Brutto (€)')).toHaveValue('618.80')
  await intake.locator('#invoice-payment-account').selectOption({ label: 'Beleg Testbank' })
  await intake.getByLabel('Rechnungsnummer').fill('WIDGET-001')
  await intake.getByRole('button', { name: 'Rechnungserfassung schließen' }).click()
  await expect(intake.getByRole('alertdialog')).toContainText('Beige_und_Braun_Elegant_Einfach_Cafe_Rechnung_A4_Dokument_mit_besonders_langem_Dateinamen_2026.pdf')
  await expect(intake.getByRole('button', { name: 'Weiter erfassen' })).toBeFocused()
  const discardLayout = await intake.getByRole('alertdialog').evaluate(dialog => {
    const bounds = dialog.getBoundingClientRect()
    return {
      overflow: dialog.scrollWidth > dialog.clientWidth,
      actionsInside: Array.from(dialog.querySelectorAll('button')).every(button => {
        const rect = button.getBoundingClientRect()
        return rect.left >= bounds.left && rect.right <= bounds.right
      })
    }
  })
  expect(discardLayout).toEqual({ overflow: false, actionsInside: true })
  await intake.screenshot({ path: 'test-results/receipt-discard-modal.png', animations: 'disabled' })
  await intake.keyboard.press('Escape')
  await expect(intake.getByRole('alertdialog')).toHaveCount(0)
  await expect(intake.getByLabel('Rechnungsnummer')).toHaveValue('WIDGET-001')
  const choice = intake.getByRole('group', { name: 'Beleg verwenden als' })
  await choice.getByRole('button', { name: 'Offene Rechnung anlegen' }).click()
  await choice.getByRole('button', { name: 'Buchung erfassen' }).click()
  await expect(intake.getByLabel('Rechnungsnummer')).toHaveValue('WIDGET-001')
  await choice.getByRole('button', { name: 'Offene Rechnung anlegen' }).click()
  const switchError = await page.evaluate(async () => {
    try { await window.api.organizations.switch({ orgId: 'default' }); return '' }
    catch (error) { return String(error) }
  })
  expect(switchError).toContain('Erfassungsfenster schließen')
  await intake.screenshot({ path: 'test-results/receipt-widget-intake.png' })
  const closed = intake.waitForEvent('close')
  await intake.locator('.local-invoice-scan__footer').getByRole('button', { name: 'Offene Rechnung anlegen', exact: true }).click()
  await closed
  const saved = await page.evaluate(async () => {
    const response = await window.api.invoices.list({ q: 'WIDGET-001' })
    return response.rows[0] ? window.api.invoices.get({ id: response.rows[0].id }) : null
  })
  expect(saved?.grossAmount).toBe(618.8)
  expect(saved?.status).toBe('OPEN')
  expect(saved?.files[0]?.fileName).toBe('Beige_und_Braun_Elegant_Einfach_Cafe_Rechnung_A4_Dokument_mit_besonders_langem_Dateinamen_2026.pdf')

  await page.evaluate(() => window.api.window.close())
  const mainVisible = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('window='))?.isVisible())
  await expect.poll(mainVisible).toBe(false)
  await widget.getByRole('button', { name: 'Belegwidget aufklappen' }).click()
  await widget.getByRole('button', { name: 'VereinO öffnen', exact: true }).click()
  await expect.poll(mainVisible).toBe(true)
  await widget.getByRole('button', { name: 'Belegwidget schließen', exact: true }).click()
})

test('receipt widget keeps local fields after AI failure and saves a booking with its file', async () => {
  await page.evaluate(async () => {
    await window.api.ai.settings.set({ apiKey: 'sk-test-widget-offline' })
    await window.api.paymentAccounts.upsert({ name: 'Widget Testbank', kind: 'BANK' })
  })
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai.invoice.extract')
    ipcMain.handle('ai.invoice.extract', () => { throw new Error('Test: KI nicht erreichbar') })
  })
  const widgetPromise = electronApp.waitForEvent('window')
  await page.evaluate(() => window.api.receiptWidget.open())
  const widget = await widgetPromise
  const intakePromise = electronApp.waitForEvent('window')
  await widget.locator('input[type="file"]').setInputFiles({ name: 'widget-booking.pdf', mimeType: 'application/pdf', buffer: await createInvoicePdf() })
  const intake = await intakePromise
  await expect(intake.getByLabel('Brutto (€)')).toHaveValue('618.80')
  await expect(intake.getByRole('checkbox', { name: /Automatisch mit/ })).toHaveCount(0)
  await intake.getByRole('button', { name: 'Mit KI auslesen', exact: true }).click()
  await expect(intake.getByRole('status')).toContainText('KI nicht erreichbar')
  await expect(intake.getByLabel('Brutto (€)')).toHaveValue('618.80')
  await intake.getByLabel('Rechnungsnummer').fill('WIDGET-BOOKING')
  await intake.locator('#invoice-payment-account').selectOption({ label: 'Widget Testbank' })
  await intake.getByRole('button', { name: 'Als Buchung übernehmen', exact: true }).click()
  await expect(intake.locator('.booking-type-overlay')).toHaveCount(0)
  await expect(intake.getByRole('button', { name: 'Ausgabe', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => intake.locator('.booking-validation-badge').allTextContents()).toEqual([])
  const closed = intake.waitForEvent('close')
  await intake.getByRole('button', { name: 'Speichern', exact: true }).click()
  await closed
  const saved = await page.evaluate(async () => {
    const result = await window.api.vouchers.list({ limit: 100 })
    return result.rows.find(row => row.description?.includes('WIDGET-BOOKING'))
  })
  expect(saved?.grossAmount).toBe(618.8)
  expect(saved?.fileCount).toBe(1)
  expect(saved?.paymentAccountName).toBe('Widget Testbank')
  await widget.getByRole('button', { name: 'Belegwidget aufklappen' }).click()
  await widget.getByRole('button', { name: 'Belegwidget schließen', exact: true }).click()
})

test('opens the local invoice modal and extracts a PDF text layer', async () => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.evaluate(() => window.api.ai.settings.set({ apiKey: 'sk-test-local-invoice-ui' }))
  await page.evaluate(() => window.api.paymentAccounts.upsert({ name: 'Rechnung Testbank', kind: 'BANK' }))

  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rechnung lokal erfassen' })).toHaveCount(0)
  await page.getByLabel('Verbindlichkeiten', { exact: true }).click()
  const scanButton = page.getByRole('button', { name: 'Rechnung erfassen', exact: true })
  await expect(scanButton).toBeVisible()
  await expect(scanButton).toHaveClass(/invoices-scan-button/)
  await scanButton.click()
  const dialog = page.locator('.local-invoice-scan')
  await expect(dialog).toBeVisible()
  await expect.poll(() => page.locator('.app-main').evaluate((element) => getComputedStyle(element).overflowY)).toBe('hidden')
  await expect(dialog.getByRole('heading', { name: 'Rechnung erfassen' })).toBeVisible()
  await expect(dialog.getByText(/Experiment|100 % lokal|Testansicht/i)).toHaveCount(0)
  await expect(dialog.getByText('Die Rechnung wird beim Anlegen an die Verbindlichkeit angehängt.')).toHaveCount(0)
  await expect(dialog.getByText('Rechnung hier ablegen')).toBeVisible()

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'rechnung-test.pdf',
    mimeType: 'application/pdf',
    buffer: await createInvoicePdf()
  })

  await expect(dialog.getByLabel('Lieferant / Rechnungssteller')).toHaveValue(
    'Auto Teile Europa GmbH', { timeout: 15_000 }
  )
  await expect(dialog.getByLabel('Rechnungsnummer')).toHaveValue('DE-001')
  await expect(dialog.getByLabel('Rechnungsdatum')).toHaveValue('2024-01-01')
  await expect(dialog.getByLabel('Fällig am')).toHaveValue('2024-01-15')
  await expect(dialog.getByLabel('Brutto (€)')).toHaveValue('618.80')
  await expect(dialog.getByLabel('Netto (€)')).toHaveValue('520.00')
  await expect(dialog.getByLabel('Umsatzsteuer (€)')).toHaveValue('98.80')
  await expect(dialog.getByLabel('IBAN')).toHaveValue('DE89370400440532013000')
  await dialog.locator('#invoice-payment-account').selectOption({ label: 'Rechnung Testbank' })
  await expect(dialog.getByRole('button', { name: 'Mit KI auslesen' })).toBeVisible()
  await dialog.locator('.local-invoice-scan__ai-guidance summary').click()
  const guidanceLayout = await dialog.evaluate((element) => {
    const guidance = element.querySelector('.local-invoice-scan__ai-guidance')!.getBoundingClientRect()
    const preview = element.querySelector('.local-invoice-scan__preview-panel')!.getBoundingClientRect()
    const result = element.querySelector('.local-invoice-scan__result-panel')!.getBoundingClientRect()
    return { guidanceWidth: guidance.width, previewWidth: preview.width, guidanceTop: guidance.top, resultTop: result.top, previewHeight: preview.height }
  })
  expect(Math.abs(guidanceLayout.guidanceWidth - guidanceLayout.previewWidth)).toBeLessThan(1)
  expect(Math.abs(guidanceLayout.guidanceTop - guidanceLayout.resultTop)).toBeLessThan(1)
  expect(guidanceLayout.previewHeight).toBeGreaterThan(200)
  await page.screenshot({ path: 'test-results/invoice-guidance-layout.png', animations: 'disabled' })

  const fieldLayout = await dialog.locator('.local-invoice-scan__fields').evaluate((container) => {
    const supplier = container.querySelector<HTMLInputElement>('#local-invoice-party')
    const invoiceNumber = container.querySelector<HTMLInputElement>('#local-invoice-party + * input, .local-invoice-scan__field:nth-child(2) input')
    if (!supplier || !invoiceNumber) throw new Error('Invoice fields are missing')
    const resultBody = container.closest('.local-invoice-scan__result-body')
    return {
      supplierRight: supplier.getBoundingClientRect().right,
      invoiceLeft: invoiceNumber.getBoundingClientRect().left,
      leftPadding: supplier.getBoundingClientRect().left - resultBody!.getBoundingClientRect().left,
      hasHorizontalOverflow: Boolean(resultBody && resultBody.scrollWidth > resultBody.clientWidth)
    }
  })
  expect(fieldLayout.supplierRight).toBeLessThanOrEqual(fieldLayout.invoiceLeft + 1)
  expect(fieldLayout.leftPadding).toBeGreaterThanOrEqual(17)
  expect(fieldLayout.hasHorizontalOverflow).toBe(false)

  await dialog.getByRole('button', { name: 'Feld-Picker' }).click()
  await expect(dialog.getByRole('button', { name: 'Feld-Picker' })).toHaveText('')
  await dialog.getByLabel('Rechnungsnummer').fill('')
  await dialog.locator('.local-invoice-scan__text-layer').evaluate((layer) => {
    const span = Array.from(layer.querySelectorAll('span')).find((element) =>
      element.textContent?.includes('DE-001')
    )
    if (!span) throw new Error('PDF text span for invoice number missing')
    const range = document.createRange()
    range.selectNodeContents(span)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await expect(dialog.getByRole('button', { name: 'Zuweisen' })).toBeEnabled()
  await dialog.getByLabel('Zielfeld für die Textauswahl').selectOption('invoiceNumber')
  await dialog.getByRole('button', { name: 'Zuweisen' }).click()
  await expect(dialog.getByLabel('Rechnungsnummer')).toHaveValue('DE-001')

  await dialog.getByRole('button', { name: '+ Budget' }).click()
  await dialog.getByRole('button', { name: '+ Tags' }).click()
  await dialog.getByRole('button', { name: '+ Kommentar' }).click()
  await expect(dialog.getByText('Budget', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Tags', { exact: true })).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Kommentar zur Verbindlichkeit' }).fill('Geprüft durch Kasse')

  const hasHorizontalOverflow = await dialog.evaluate(
    (element) => element.scrollWidth > element.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)

  await dialog.getByRole('button', { name: 'Verbindlichkeit anlegen' }).click()
  await expect(page.locator('.toast.error')).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => page.evaluate(async () => {
    const rows = await window.api.invoices.list({ q: 'DE-001' })
    return rows.rows.some((entry) => entry.invoiceNo === 'DE-001')
  })).toBe(true)
  const savedInvoice = await page.evaluate(async () => {
    const rows = await window.api.invoices.list({ q: 'DE-001' })
    const row = rows.rows.find((entry) => entry.invoiceNo === 'DE-001')
    return row ? window.api.invoices.get({ id: row.id }) : null
  })
  expect(savedInvoice?.voucherType).toBe('OUT')
  expect(savedInvoice?.grossAmount).toBe(618.8)
  expect(savedInvoice?.note).toContain('Geprüft durch Kasse')
  expect(savedInvoice?.files[0]?.fileName).toBe('rechnung-test.pdf')
})


test('links AI source rectangles to fields and removes evidence after manual edits', async () => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.evaluate(() => window.api.ai.settings.set({ apiKey: 'sk-test-local-invoice-ui' }))
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai.invoice.extract')
    ipcMain.handle('ai.invoice.extract', (_event, payload) => ({
      result: {
        supplier: 'Auto Teile Europa GmbH', partyId: null, invoiceNumber: 'DE-001',
        counterpartyIban: 'DE89370400440532013000',
        invoiceDate: '2024-01-01', dueDate: '2024-01-15', grossAmount: payload.file.mimeType === 'image/png' ? 119 : 618.8,
        netAmount: 520, taxAmount: 98.8, vatRate: 19, iban: null, description: null,
        type: 'OUT', sphere: 'IDEELL', primaryClassificationValueId: null,
        paymentMethod: null, paymentAccountId: null, budgets: [], earmarks: [], tags: [],
        confidence: 1, warnings: [], evidence: [],
        fieldSources: [{ field: 'grossAmount', page: 1, text: payload.file.mimeType === 'image/png' ? '−119 €' : '618,80 EUR' }]
      },
      timings: { totalMs: 10, analysisMs: 10, ocrMs: null, doclingMs: null }
    }))
  })
  await page.getByLabel('Verbindlichkeiten', { exact: true }).click()
  await page.getByRole('button', { name: 'Rechnung erfassen', exact: true }).click()
  const dialog = page.locator('.local-invoice-scan')
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'sources.pdf', mimeType: 'application/pdf', buffer: await createInvoicePdf()
  })
  await expect(dialog.getByLabel('Brutto (€)')).toHaveValue('618.80', { timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Mit KI auslesen', exact: true }).click()
  const source = dialog.getByRole('button', { name: 'Brutto: 618,80 EUR', exact: true })
  await expect(source).toBeVisible()
  await dialog.locator('.party-selector__add').click()
  const partyEditor = page.getByRole('dialog', { name: 'Geschäftspartner anlegen' })
  await expect(partyEditor.getByLabel('IBAN', { exact: true })).toHaveValue('DE89370400440532013000')
  await expect(partyEditor.getByLabel('IBAN', { exact: true })).toBeVisible()
  await partyEditor.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await source.click()
  await expect(dialog.getByLabel('Brutto (€)')).toBeFocused()
  await expect(source).toHaveClass(/is-active/)
  const geometry = await source.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const preview = element.closest('.local-invoice-scan__pdf-page')!.getBoundingClientRect()
    return { x: (box.x - preview.x) / preview.width, y: (box.y - preview.y) / preview.height }
  })
  expect(geometry.x).toBeGreaterThan(54 / 595)
  expect(geometry.x).toBeLessThan(0.6)
  expect(geometry.y).toBeGreaterThan(0.3)
  expect(geometry.y).toBeLessThan(0.4)
  await page.screenshot({ path: 'test-results/invoice-source-rectangles.png', animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Fundstellen ausblenden' }).click()
  await expect(source).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Fundstellen anzeigen' }).click()
  await expect(source).toBeVisible()
  await dialog.getByRole('button', { name: 'PDF vergrößern' }).click()
  await expect(dialog.locator('.local-invoice-scan__zoom-label')).toHaveText('115%')
  await expect(source).toBeVisible()
  await dialog.getByLabel('Brutto (€)').fill('619.00')
  await expect(source).toHaveCount(0)

  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ocr.extract')
    ipcMain.handle('ocr.extract', () => ({
      text: 'Gutschrift Musterbedarf Brutto −119 €', confidence: 100,
      pages: [{ text: 'Gutschrift Musterbedarf Brutto −119 €', confidence: 100,
        words: [{ text: '−119 €', x: 100, y: 200, width: 120, height: 30 }] }]
    }))
  })
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800; canvas.height = 1000
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'; context.fillRect(0, 0, 800, 1000)
    context.fillStyle = 'black'; context.font = '30px sans-serif'; context.fillText('−119 €', 100, 225)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'credit.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await expect(dialog.getByRole('img', { name: 'Rechnung', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Mit KI auslesen', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Mit KI auslesen', exact: true }).click()
  const imageSource = dialog.getByRole('button', { name: 'Brutto: −119 €', exact: true })
  await expect(imageSource).toBeVisible()
  await expect(dialog.getByLabel('Brutto (€)')).toHaveValue('119.00')
  const imageGeometry = await imageSource.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const img = element.closest('.local-invoice-scan__source-image')!.querySelector('img')!.getBoundingClientRect()
    return { x: (box.x - img.x) / img.width, y: (box.y - img.y) / img.height }
  })
  expect(imageGeometry.x).toBeCloseTo(100 / 800, 2)
  expect(imageGeometry.y).toBeCloseTo(200 / 1000, 2)
})
