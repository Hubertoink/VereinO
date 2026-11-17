import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import path from 'node:path'

let script: string
let css: string

test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8') + '\n' + await fs.readFile('src/renderer/components/modals/quickAddLayout.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/booking/bankDraftSource.css', 'utf8') + '\n' + await fs.readFile('src/renderer/components/compactBookingFlyout.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/common/party.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/modalHeader.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/booking/bookingAttachmentPreview.css', 'utf8')
  const result = await build({ jsx: 'automatic',
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { ToastProvider } from './src/renderer/context/ToastContext'
      import { useToast } from './src/renderer/context/useToast'
      import { useQuickAdd } from './src/renderer/hooks/useQuickAdd'
      import { resolveBankDraftParty } from './src/renderer/utils/bankDraftParty'
      import { bankDraftSourceFromTransaction } from './src/renderer/types/bankDraftSource'
      import { selectAiDraftBookingType } from './src/renderer/utils/aiBookingDraft'
      import QuickAddModal from './src/renderer/components/modals/QuickAddModal'
      import CompactBookingFlyout from './src/renderer/components/CompactBookingFlyout'
      function Harness() {
        const { notify } = useToast()
        const hook = useQuickAdd('2026-09-25', async () => ({ id: 1 }), undefined, undefined, true)
        const [presentation, setPresentation] = React.useState('flyout')
        const fileInputRef = React.useRef(null)
        window.changePresentation = setPresentation
        window.currentQa = hook.qa
        window.setAttachments = hook.setFiles
        window.newDraft = () => hook.openQuickAdd()
        window.parkDraft = hook.parkQuickAdd
        window.replaceDraft = () => hook.updateDraft(hook.activeDraftId, { qa: { type: 'OUT',
          date: '2026-09-25', grossAmount: 75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL', description: 'Beleg', paymentAccountId: 1 } })
        window.reopenDraft = () => hook.reopenDraft(hook.activeDraftId)
        window.prefill = (selected) => hook.openQuickAdd({ qa: { type: 'OUT', bookingTypeSelected: selected,
          date: '2026-09-25', grossAmount: 75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL', description: 'Vorbelegt', paymentAccountId: 1 } })
        window.aiBankDraft = async () => hook.openQuickAdd({ qa: selectAiDraftBookingType({ type: 'OUT',
          date: '2026-08-17', grossAmount: 118.75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL',
          description: 'Farbe und Werkzeug Renovierung Gruppenraum · OBI GmbH', paymentAccountId: 1,
          ...await resolveBankDraftParty({ counterparty: 'OBI GmbH' }, async () => ({ rows: [{ id: 7, name: 'OBI GmbH', isActive: 1 }] })),
          bankTransactionId: 77, bankReviewSource: bankDraftSourceFromTransaction({ id: 77, bookingDate: '2026-08-17',
            valueDate: '2026-08-18', direction: 'OUT', amount: 118.75, currency: 'EUR', counterparty: 'OBI GmbH', counterpartyIban: 'DE12 5001 0517 0648 4898 90',
            purpose: 'Farbe und Werkzeug Renovierung Gruppenraum', paymentAccountName: 'Bank', bankReference: 'BREF-JH-0011', sourceFileName: 'umsatz.csv' }) }) })
        window.aiPartyDraft = () => hook.openQuickAdd({ qa: selectAiDraftBookingType({ type: 'OUT',
          date: '2026-08-17', grossAmount: 118.75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL', description: 'Werkzeug',
          paymentAccountId: 1, counterparty: 'OBI GmbH', partyCreationSource: { name: 'OBI GmbH', iban: 'DE12 5001 0517 0648 4898 90' } }) })
        window.aiDraft = (type) => hook.openQuickAdd({ qa: selectAiDraftBookingType({ type,
          date: '2026-09-25', grossAmount: 75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL', description: 'KI-Vorschlag', paymentAccountId: 1 }) })
        React.useEffect(() => { hook.openQuickAdd() }, [])
        const props = { notify, qa: hook.qa, setQa: hook.setQa, onSave: hook.onQuickSave, onClose: hook.parkQuickAdd,
          files: hook.files, setFiles: hook.setFiles, onDropFiles: hook.onDropFiles, openFilePicker: () => {}, fileInputRef,
          budgetsForEdit: [], earmarks: [], tagDefs: [], descSuggest: [], paymentAccounts: [
            { id: 1, name: 'Bank', kind: 'BANK', isActive: 1 }, { id: 2, name: 'Bar', kind: 'CASH', isActive: 1 }
          ] }
        if (!hook.quickAdd) return null
        return presentation === 'flyout'
          ? <div className="compact-booking-flyout-anchor"><CompactBookingFlyout key={hook.activeDraftId} {...props} afterSaveDefault="close" draftTabsEnabled={false}
              draftTabs={[]} activeDraftId={hook.activeDraftId} onSelectDraft={() => {}} onNewDraft={() => hook.openQuickAdd()}
              onExpand={() => setPresentation('modal')} /></div>
          : <QuickAddModal key={hook.activeDraftId} {...props} windowMode={presentation === 'detached'}
              fmtDate={d => d} eurFmt={new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })} />
      }
      createRoot(document.getElementById('root')).render(<ToastProvider><Harness /></ToastProvider>)
    ` }, bundle: true, write: false, platform: 'browser', plugins: [{ name: 'pdf-worker-url', setup(builder) {
      builder.onResolve({ filter: /^pdfjs-dist\/legacy\/build\/pdf$/ }, () => ({ path: path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs') }))
      builder.onResolve({ filter: /pdf\.worker.*\?url$/ }, args => ({ path: args.path, namespace: 'worker-url' }))
      builder.onLoad({ filter: /.*/, namespace: 'worker-url' }, () => ({ contents: 'export default "http://booking.test/pdf.worker.mjs"', loader: 'js' }))
    } }], loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(error.message))
  await page.route('http://booking.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div id="root"></div></html>' }))
  await page.route('http://booking.test/pdf.worker.mjs', async route => route.fulfill({ contentType: 'text/javascript', body: await fs.readFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'utf8') }))
  await page.goto('http://booking.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' })
  await page.addScriptTag({ content: script })
  await expect(page.getByRole('group', { name: 'Buchungsart wählen' })).toBeVisible()
})

for (const presentation of ['flyout', 'modal', 'detached']) {
  test(`${presentation}: missing date and category show toasts without shifting the form`, async ({ page }, testInfo) => {
    await page.evaluate(value => {
      const fixtureWindow = window as any
      fixtureWindow.api = {
        ...fixtureWindow.api,
        classifications: { primary: { list: async () => ({
          profile: 'GENERAL', definition: { primaryLabel: 'Kategorie' },
          values: [{ id: 7, name: 'Material', isActive: 1 }]
        }) } }
      }
      fixtureWindow.changePresentation(value)
      fixtureWindow.prefill(true)
    }, presentation)
    const category = page.getByRole('button', { name: 'Kategorie der Buchung', exact: true })
    await expect(category).toHaveAttribute('aria-invalid', 'true')
    await expect(category).toHaveClass(/input-error/)
    await expect(page.locator('small[role="status"]')).toHaveCount(0)
    const dateInput = page.locator('input[type=date]').first()
    const save = page.locator('button[type=submit]').first()
    const before = await category.evaluate(element => element.offsetTop)
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.locator('.toast.info').last()).toHaveText('Bitte eine Kategorie auswählen.')
    await page.screenshot({ path: testInfo.outputPath('missing-category-toast.png') })
    await page.keyboard.press('Control+s')
    await expect(category).toBeVisible()
    expect(await page.evaluate(() => (window as any).currentQa.description)).toBe('Vorbelegt')
    await category.click()
    await page.getByRole('option', { name: 'Material', exact: true }).click()
    await expect(category).not.toHaveAttribute('aria-invalid', 'true')
    expect(await category.evaluate(element => element.offsetTop)).toBe(before)
    await dateInput.fill('')
    await expect(dateInput).toHaveAttribute('aria-invalid', 'true')
    await expect(dateInput).toHaveClass(/input-error/)
    await save.click()
    await expect(page.locator('.toast.info').last()).toHaveText('Bitte ein Buchungsdatum auswählen.')
    await page.screenshot({ path: testInfo.outputPath('missing-date-toast.png') })
    await page.keyboard.press('Control+s')
    await expect(dateInput).toBeVisible()
    await dateInput.fill('2026-11-13')
    await expect(dateInput).toHaveAttribute('aria-invalid', 'false')
    expect(await category.evaluate(element => element.offsetTop)).toBe(before)
    const calendar = page.getByRole('button', { name: 'Kalender zur Datumsauswahl öffnen' })
    for (const state of ['normal', 'hover', 'focus']) {
      if (state === 'hover') await calendar.hover()
      if (state === 'focus') { await page.mouse.move(0, 0); await calendar.focus() }
      const inputBounds = (await dateInput.boundingBox())!
      const iconBounds = (await calendar.locator('svg').boundingBox())!
      expect(Math.abs(inputBounds.y + inputBounds.height / 2 - iconBounds.y - iconBounds.height / 2)).toBeLessThanOrEqual(1)
    }
    await page.screenshot({ path: testInfo.outputPath('category-date-toast.png') })
    await expect(save).toBeEnabled()
    expect(await page.evaluate(() => (window as any).currentQa.primaryClassificationValueId)).toBe(7)
  })

  test(`${presentation}: unlock blurred fields without moving the editor, then switch without losing input`, async ({ page }, testInfo) => {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    const choices = page.getByRole('group', { name: 'Buchungsart wählen' })
    for (const label of ['Einnahme', 'Ausgabe', 'Umbuchung', 'Intern']) {
      await page.evaluate(() => (window as any).newDraft())
      await expect(page.locator('.booking-type-fields')).toHaveAttribute('inert', '')
      await expect(choices.locator('[aria-pressed=true]')).toHaveCount(0)
      await expect(page.locator('button[type=submit]').first()).toBeDisabled()
      await page.locator('input[type=date]').first().evaluate((input: HTMLInputElement) => input.focus())
      await expect(page.locator('input[type=date]').first()).not.toBeFocused()
      const editor = page.locator(presentation === 'flyout' ? '.compact-booking-flyout' : '.quick-add-modal')
      const before = await editor.boundingBox()
      if (label === 'Einnahme') {
        const prompt = await page.locator('.booking-type-prompt').boundingBox()
        const switchBounds = await choices.boundingBox()
        expect(prompt!.y).toBeGreaterThan(switchBounds!.y + switchBounds!.height)
        await page.screenshot({ path: testInfo.outputPath('type-selection.png'), animations: 'disabled' })
      }
      await choices.getByRole('button', { name: label, exact: true }).click()
      await expect(page.locator('.booking-type-fields')).not.toHaveAttribute('inert', '')
      const after = await editor.boundingBox()
      expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1)
      if (presentation === 'flyout') {
        const footer = await page.locator('.compact-booking-flyout__footer').boundingBox()
        expect(after!.y + after!.height - footer!.y - footer!.height).toBeLessThanOrEqual(20)
      }
      await expect(page.locator('input[type=date]').first()).toBeVisible()
      await expect(choices.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.locator('input[type=date]').first().fill('2026-09-25')
      await choices.getByRole('button', { name: label === 'Ausgabe' ? 'Einnahme' : 'Ausgabe', exact: true }).click()
      await expect(page.locator('input[type=date]').first()).toHaveValue('2026-09-25')
    }
  })
}

test('selection survives switching presentation, parking and reopening', async ({ page }) => {
  await page.getByRole('button', { name: 'Ausgabe', exact: true }).click()
  for (const presentation of ['modal', 'detached', 'flyout']) {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    await expect(page.locator('input[type=date]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ausgabe', exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await page.evaluate(() => (window as any).parkDraft())
  await page.evaluate(() => (window as any).reopenDraft())
  await expect(page.locator('input[type=date]').first()).toBeVisible()
})

test('the blurred selection screen keeps its geometry in a narrow window', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 600, height: 800 })
  for (const presentation of ['flyout', 'modal']) {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    await page.evaluate(() => (window as any).newDraft())
    await expect(page.locator('.booking-type-overlay')).toBeVisible()
    const editor = page.locator(presentation === 'flyout' ? '.compact-booking-flyout' : '.quick-add-modal')
    const before = await editor.boundingBox()
    const choice = await page.getByRole('button', { name: 'Einnahme', exact: true }).boundingBox()
    const prompt = await page.locator('.booking-type-prompt').boundingBox()
    expect(choice!.y + choice!.height).toBeLessThan(prompt!.y)
    await page.screenshot({ path: testInfo.outputPath(`${presentation}-narrow.png`), animations: 'disabled' })
    await page.getByRole('button', { name: 'Ausgabe', exact: true }).click()
    await expect(page.locator('.booking-type-overlay')).toHaveCount(0)
    const after = await editor.boundingBox()
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1)
    expect(after!.x).toBeGreaterThanOrEqual(0)
    expect(after!.x + after!.width).toBeLessThanOrEqual(600)
  }
})

test('prefilled drafts require confirmation and retain their values', async ({ page }) => {
  await page.evaluate(() => (window as any).prefill(undefined))
  await expect(page.locator('.booking-type-fields')).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Ausgabe', exact: true }).click()
  await expect(page.locator('input[type=date]').first()).toHaveValue('2026-09-25')
  await expect(page.getByRole('spinbutton', { name: 'Brutto-Betrag' })).toHaveValue('75')
})

test('AI drafts open with the suggested income or expense type already selected', async ({ page }) => {
  for (const presentation of ['flyout', 'modal']) {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    for (const [type, label] of [['OUT', 'Ausgabe'], ['IN', 'Einnahme']] as const) {
      await page.evaluate(value => (window as any).aiDraft(value), type)
      await expect(page.locator('.booking-type-overlay')).toHaveCount(0)
      await expect(page.locator('.booking-type-fields')).not.toHaveAttribute('inert', '')
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('input[type=date]').first()).toHaveValue('2026-09-25')
      await expect(page.getByRole('spinbutton', { name: 'Brutto-Betrag' })).toHaveValue('75')
    }
  }
})

test('replacing draft data preserves whether the type has been selected', async ({ page }) => {
  await page.evaluate(() => (window as any).replaceDraft())
  await expect(page.locator('.booking-type-fields')).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Ausgabe', exact: true }).click()
  await expect(page.locator('input[type=date]').first()).toHaveValue('2026-09-25')
  await page.evaluate(() => (window as any).replaceDraft())
  await expect(page.locator('input[type=date]').first()).toBeVisible()
})

for (const presentation of ['modal', 'detached']) {
  test(`${presentation}: footer and window actions stay at the frame edges across sizes`, async ({ page }, testInfo) => {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
    const editor = page.locator('.quick-add-modal')
    const footer = editor.locator('.modal-footer-actions')
    for (const size of [{ width: 1440, height: 1200 }, { width: 1280, height: 720 }, { width: 601, height: 800 }, { width: 600, height: 800 }]) {
      await page.setViewportSize(size)
      for (const expanded of [false, true]) {
        if (expanded) await editor.locator('details').filter({ hasText: 'Kommentar' }).locator('summary').click()
        const bounds = (await editor.boundingBox())!
        const footerBounds = (await footer.boundingBox())!
        expect(Math.abs(bounds.y + bounds.height - footerBounds.y - footerBounds.height)).toBeLessThanOrEqual(2)
        expect(footerBounds.y).toBeGreaterThan(bounds.y)
        const close = (await editor.getByRole('button', { name: 'Schließen', exact: true }).boundingBox())!
        const headerElement = editor.locator('.modal-header-bar')
        const header = (await headerElement.boundingBox())!
        const headerPadding = await headerElement.evaluate(element => {
          const style = getComputedStyle(element)
          return { top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft }
        })
        if (presentation === 'detached') {
          // Native window controls must reach the outer frame, including at
          // the shared header's 600px responsive breakpoint.
          expect(headerPadding).toEqual({ top: '0px', right: '0px', bottom: '0px', left: '0px' })
          expect(Math.abs(close.x + close.width - bounds.x - bounds.width)).toBeLessThanOrEqual(2)
          expect(Math.abs(close.y - bounds.y)).toBeLessThanOrEqual(2)
          expect(close.width).toBe(48)
          expect(close.height).toBe(44)
        } else {
          // Standard ModalHeader uses 20px horizontal/16px vertical padding;
          // below 601px it uses 16px/14px. The modal adds its 1px border.
          const horizontal = size.width <= 600 ? 16 : 20
          const vertical = size.width <= 600 ? 14 : 16
          expect(headerPadding).toEqual({ top: `${vertical}px`, right: `${horizontal}px`, bottom: `${vertical}px`, left: `${horizontal}px` })
          expect(header.x + header.width - close.x - close.width).toBeCloseTo(horizontal, 0)
          expect(bounds.x + bounds.width - close.x - close.width).toBeCloseTo(horizontal + 1, 0)
          expect(close.width).toBe(34)
          expect(close.height).toBe(32)
          expect(Math.abs(close.y + close.height / 2 - header.y - header.height / 2)).toBeLessThanOrEqual(2)
        }
        if (presentation === 'detached') expect(Math.abs(bounds.height - size.height)).toBeLessThanOrEqual(2)
        else if (size.height === 1200) expect(bounds.height).toBeLessThan(size.height * .85)
        await editor.locator('form').evaluate(form => { form.scrollTop = form.scrollHeight })
        await expect(editor.locator('.quick-add-dropzone')).toBeInViewport()
        const scrolledFooter = (await footer.boundingBox())!
        expect(Math.abs(bounds.y + bounds.height - scrolledFooter.y - scrolledFooter.height)).toBeLessThanOrEqual(2)
        await editor.locator('form').evaluate(form => { form.scrollTop = 0 })
        if (expanded) await editor.locator('details').filter({ hasText: 'Kommentar' }).locator('summary').click()
      }
    }
    await page.setViewportSize({ width: 1440, height: 1200 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
      await page.screenshot({ path: testInfo.outputPath(`${presentation}-${theme}.png`), animations: 'disabled' })
    }
  })

  test(`${presentation}: missing date shows a toast while invalid amounts keep saving disabled`, async ({ page }) => {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
    const save = page.getByRole('button', { name: 'Speichern', exact: true })
    const menu = page.getByRole('button', { name: 'Weitere Speicheraktionen' })
    await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(0)
    await page.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('25')
    await expect(save).toBeEnabled()
    await expect(menu).toBeEnabled()
    await save.click()
    await expect(page.locator('.toast.info').last()).toHaveText('Bitte ein Buchungsdatum auswählen.')
    await page.locator('#quick-add-date').fill('2026-10-08')
    await expect(save).toBeEnabled()
    await expect(menu).toBeEnabled()
    await page.locator('#quick-add-amount').fill('0')
    await expect(save).toBeDisabled()
    await page.locator('#quick-add-amount').fill('25')
    await page.locator('#quick-add-date').fill('')
    await expect(save).toBeEnabled()
    await page.keyboard.press('Control+s')
    await expect(page.locator('.toast.info').last()).toHaveText('Bitte ein Buchungsdatum auswählen.')
  })
}


test('AI bank draft keeps original data beside the editor and highlights matching source fields', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; (window as any).aiBankDraft() })
  const panel = page.locator('.bank-draft-source')
  await expect(panel).toHaveClass(/--docked/)
  await expect(panel).toContainText('OBI GmbH')
  await expect(page.getByRole('combobox', { name: 'Lieferant oder Zahlungsempfänger' })).toHaveValue('OBI GmbH')
  await page.locator('[data-bank-review-field=party]').hover()
  await expect(panel.locator('[data-bank-source=party]')).toHaveClass(/is-highlighted/)
  await expect(panel).toContainText('BREF-JH-0011')
  const bounds = await panel.boundingBox()
  const editor = await page.locator('.compact-booking-flyout').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThan(editor!.x)
  expect(Math.abs(bounds!.y - editor!.y)).toBeLessThan(2)
  await page.locator('[data-bank-review-field=date]').hover()
  await expect(panel.locator('[data-bank-source=date]')).toHaveClass(/is-highlighted/)
  await expect(panel.locator('[data-bank-source=valueDate]')).toHaveClass(/is-highlighted/)
  await page.getByLabel('Datum der Buchung').fill('2026-08-19')
  await expect(panel.locator('[data-bank-source=date]')).toContainText('17.08.2026')
  await page.locator('[data-bank-review-field=description]').hover()
  await expect(panel.locator('[data-bank-source=purpose]')).toHaveClass(/is-highlighted/)
  await expect(panel.locator('[data-bank-source=party]')).toHaveClass(/is-highlighted/)
  await page.mouse.move(0, 0)
  await page.getByRole('spinbutton', { name: 'Brutto-Betrag', exact: true }).focus()
  await expect(panel.locator('[data-bank-source=amount]')).toHaveClass(/is-highlighted/)
  await page.getByRole('spinbutton', { name: 'Brutto-Betrag', exact: true }).fill('120')
  await expect(panel.locator('[data-bank-source=amount]')).toContainText('118,75')
  await page.screenshot({ path: testInfo.outputPath('bank-source-docked.png') })
  await page.evaluate(() => (window as any).parkDraft())
  await expect(panel).toHaveCount(0)
  await page.evaluate(() => (window as any).reopenDraft())
  await expect(panel).toContainText('118,75')
  await page.setViewportSize({ width: 650, height: 850 })
  await expect(panel).toHaveClass(/--inline/)
  await expect(panel.locator('summary')).toBeVisible()
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('bank-source-narrow.png') })
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.getByRole('button', { name: 'Vollständigen Buchungsdialog öffnen' }).click()
  await expect(panel).toBeVisible()
  await page.getByLabel('Datum der Buchung').focus()
  await page.mouse.move(0, 0)
  await expect(panel.locator('[data-bank-source=date]')).toHaveClass(/is-highlighted/)
  await page.screenshot({ path: testInfo.outputPath('bank-source-full.png') })
  await page.evaluate(() => (window as any).newDraft())
  await expect(panel).toHaveCount(0)
})


for (const source of ['bank', 'booking']) {
  for (const presentation of ['flyout', 'modal']) {
    test(`${source} ${presentation}: partner creation prefills and saves the source IBAN centrally`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.evaluate(async ({ source, presentation }) => {
        const win = window as any
        win.api = { parties: {
          list: async () => ({ rows: [] }),
          upsert: async (input: any) => { win.savedParty = input; return { id: 42 } },
          get: async () => ({ ...win.savedParty, id: 42 })
        } }
        if (source === 'bank') await win.aiBankDraft()
        else win.aiPartyDraft()
        win.changePresentation(presentation)
      }, { source, presentation })
      await page.locator('[data-bank-review-field=party] .party-selector__add, .booking-finance-party .party-selector__add, .compact-booking-party-section .party-selector__add').click()
      const editor = page.getByRole('dialog', { name: 'Geschäftspartner anlegen' })
      await expect(editor.getByLabel('IBAN', { exact: true })).toBeVisible()
      await expect(editor.getByLabel('IBAN', { exact: true })).toHaveValue('DE12500105170648489890')
      await expect(editor.getByLabel('Name *', { exact: true })).toHaveValue('OBI GmbH')
      await editor.getByRole('button', { name: 'Speichern', exact: true }).click()
      await expect(editor).toHaveCount(0)
      expect(await page.evaluate(() => (window as any).savedParty.iban)).toBe('DE12500105170648489890')
      expect(await page.evaluate(() => (window as any).currentQa.partyId)).toBe(42)
    })
  }
}

test('changing the counterparty does not copy the original IBAN into another partner', async ({ page }) => {
  await page.evaluate(() => (window as any).aiPartyDraft())
  await page.getByRole('combobox', { name: 'Lieferant oder Zahlungsempfänger' }).fill('Anderer Lieferant')
  await page.locator('.compact-booking-party-section .party-selector__add').click()
  const editor = page.getByRole('dialog', { name: 'Geschäftspartner anlegen' })
  await editor.getByText('Zahlung & Steuer', { exact: true }).click()
  await expect(editor.getByLabel('IBAN', { exact: true })).toHaveValue('')
})


for (const theme of ['light', 'dark']) {
  test(`attachment lightbox: ${theme}, image and A4 PDF fit the window independently of the form`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.addStyleTag({ content: await fs.readFile('src/renderer/views/AI/AIView.css', 'utf8') })
    await page.evaluate(value => {
      document.documentElement.dataset.theme = value
      const canvas = document.createElement('canvas')
      canvas.width = 595; canvas.height = 842
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 595, 842)
      ctx.fillStyle = '#17191d'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('RECHNUNG', 48, 80)
      ctx.font = '18px sans-serif'; ctx.fillText('VereinO · Material', 48, 150)
      ctx.fillText('Gesamt: 119,00 €', 48, 550)
      canvas.toBlob(blob => (window as any).setAttachments([new File([blob!], 'Rechnung A4.png', { type: 'image/png' }), new File([blob!], 'Zweiter Anhang.png', { type: 'image/png' })]))
    }, theme)
    const preview = page.getByRole('complementary', { name: 'Belegvorschau' })
    const img = preview.getByRole('img', { name: 'Beleg: Rechnung A4.png' })
    await expect(img).toBeVisible()
    await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalHeight)).toBe(842)
    await expect(preview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(preview).toHaveCSS('border-top-width', '0px')
    const lightbox = (await preview.boundingBox())!
    const form = (await page.locator('.compact-booking-flyout-anchor').boundingBox())!
    expect(lightbox.height).toBeGreaterThan(form.height)
    expect(lightbox.y).toBeGreaterThanOrEqual(12)
    expect(lightbox.y + lightbox.height).toBeLessThanOrEqual(988)
    expect(lightbox.x + lightbox.width).toBeLessThan(form.x)
    await page.screenshot({ path: testInfo.outputPath(`lightbox-image-${theme}.png`) })
    await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
    await page.getByRole('button', { name: /Anhang · 2/ }).click()
    await page.getByRole('button', { name: 'Zweiter Anhang.png anzeigen', exact: true }).click()
    await expect(preview.getByRole('img', { name: 'Beleg: Zweiter Anhang.png' })).toBeVisible()
    await preview.getByRole('button', { name: 'Belegvorschau schließen' }).click()
    await expect(preview).toHaveCount(0)
    await page.getByRole('button', { name: 'Zweiter Anhang.png anzeigen', exact: true }).click()
    await expect(preview.getByRole('img', { name: 'Beleg: Zweiter Anhang.png' })).toBeVisible()
    await page.getByRole('button', { name: 'Rechnung A4.png anzeigen', exact: true }).click()
    await expect(img).toBeVisible()
    const menuBounds = await preview.locator('header').boundingBox()
    const closeBounds = await preview.getByRole('button', { name: 'Belegvorschau schließen' }).boundingBox()
    await page.getByRole('button', { name: 'Rechnung A4.png entfernen', exact: true }).click()
    await expect(preview.getByRole('img', { name: 'Beleg: Zweiter Anhang.png' })).toBeVisible()
    expect(await preview.locator('header').boundingBox()).toEqual(menuBounds)
    expect(await preview.getByRole('button', { name: 'Belegvorschau schließen' }).boundingBox()).toEqual(closeBounds)
    const pdf = await PDFDocument.create()
    pdf.addPage([595, 842]).drawText('RECHNUNG - Seite 1', { x: 48, y: 760, size: 24 })
    pdf.addPage([595, 842]).drawText('Seite 2', { x: 48, y: 760, size: 24 })
    await page.evaluate(base64 => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      ;(window as any).setAttachments([new File([bytes], 'Rechnung A4.pdf', { type: 'application/pdf' })])
    }, await pdf.saveAsBase64())
    const canvas = preview.locator('canvas')
    await expect(preview.getByText('Seite 1 / 2')).toBeVisible()
    await expect.poll(() => canvas.evaluate(el => el.height)).toBeGreaterThan(500)
    const viewport = (await preview.locator('.ai-pdf-preview__viewport').boundingBox())!
    const paper = (await canvas.boundingBox())!
    expect(paper.width).toBeLessThanOrEqual(viewport.width)
    expect(paper.height).toBeLessThanOrEqual(viewport.height)
    const firstPagePixels = await canvas.evaluate(el => el.toDataURL())
    await preview.getByRole('button', { name: 'Nächste Seite' }).click()
    await expect(preview.getByText('Seite 2 / 2')).toBeVisible()
    await expect.poll(() => canvas.evaluate(el => el.toDataURL())).not.toBe(firstPagePixels)
    await page.screenshot({ path: testInfo.outputPath(`lightbox-pdf-${theme}.png`) })
    await page.setViewportSize({ width: 800, height: 700 })
    await expect(preview).toHaveCount(0)
    await page.setViewportSize({ width: 1600, height: 1000 })
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Belegvorschau schließen' }).click()
    await expect(preview).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Buchungsart wählen' })).toBeVisible()
  })
}


test('clicking an attachment unfolds a sheet and skips the wave for reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 200; canvas.height = 300
    const context = canvas.getContext('2d')!
    context.fillStyle = '#e5e7eb'; context.fillRect(0, 0, 200, 300)
    context.fillStyle = '#111'; context.font = '20px sans-serif'; context.fillText('Rechnung', 20, 40)
    canvas.toBlob(blob => (window as any).setAttachments([
      new File([blob!], 'Erster Beleg.png', { type: 'image/png' }),
      new File([blob!], 'Zweiter Beleg.png', { type: 'image/png' })
    ]))
    ;(window as any).revealCount = 0
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.classList.contains('attachment-reveal-wave')) (window as any).revealCount++
      }
    }).observe(document.body, { childList: true })
  })
  await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
  await page.getByRole('button', { name: /Anhang · 2/ }).click()
  const menuBefore = await page.locator('.booking-attachment-preview > header').boundingBox()
  await page.evaluate(() => {
    const frames: Array<{ x: number; y: number; width: number; height: number; opacity: number }> = []
    ;(window as any).menuFrames = frames
    ;(window as any).sampleMenu = true
    const sample = () => {
      const menu = document.querySelector('.booking-attachment-preview > header')
      if (menu) {
        const { x, y, width, height } = menu.getBoundingClientRect()
        let opacity = 1
        for (let el: Element | null = menu; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
        frames.push({ x, y, width, height, opacity })
      }
      if ((window as any).sampleMenu) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.getByRole('button', { name: 'Zweiter Beleg.png anzeigen', exact: true }).click()
  const wave = page.locator('.attachment-reveal-wave')
  const preview = page.getByRole('complementary', { name: 'Belegvorschau' })
  await expect(wave).toBeVisible()
  await expect(wave).toHaveCSS('pointer-events', 'none')
  await expect.poll(() => wave.evaluate((canvas: HTMLCanvasElement) => {
    const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    return bytes.some((value, index) => index % 4 === 3 && value > 0)
  })).toBe(true)
  await page.evaluate(() => { (window as any).activeReveal = document.querySelector('.attachment-reveal-wave') })
  await page.getByRole('button', { name: 'Zweiter Beleg.png anzeigen', exact: true }).click()
  expect(await page.evaluate(() => document.querySelector('.attachment-reveal-wave') === (window as any).activeReveal)).toBe(true)
  expect(await page.evaluate(() => (window as any).revealCount)).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('attachment-wave.png') })
  await expect(wave).toHaveCount(0)
  await expect(preview).toHaveCSS('opacity', '1')
  const menuFrames = await page.evaluate(() => { (window as any).sampleMenu = false; return (window as any).menuFrames })
  expect(menuFrames.length).toBeGreaterThan(5)
  for (const { opacity, ...bounds } of menuFrames) {
    expect(opacity).toBe(1)
    expect(bounds).toEqual(menuBefore)
  }
  await expect(preview.getByRole('img', { name: 'Beleg: Zweiter Beleg.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Zweiter Beleg.png anzeigen', exact: true }).dblclick()
  expect(await page.evaluate(() => (window as any).revealCount)).toBe(1)
  await expect(wave).toHaveCount(0)
  await preview.getByRole('button', { name: 'Belegvorschau schließen' }).click()
  await expect(preview).toHaveCount(0)
  await page.getByRole('button', { name: 'Zweiter Beleg.png anzeigen', exact: true }).click()
  await expect(wave).toBeVisible()
  await expect(wave).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).revealCount)).toBe(2)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Erster Beleg.png anzeigen' , exact: true }).click()
  await expect(preview.getByRole('img', { name: 'Beleg: Erster Beleg.png' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).revealCount)).toBe(2)
})


for (const kind of ['image', 'pdf']) {
  test(`attachment reveal: ${kind} never flashes at its destination while loading`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    const pdf = await PDFDocument.create()
    pdf.addPage([595, 842]).drawText('Rechnung', { x: 40, y: 760, size: 24 })
    if (kind === 'pdf') {
      await page.route('http://booking.test/pdf.worker.mjs', async route => {
        await new Promise(resolve => setTimeout(resolve, 150))
        await route.fulfill({ contentType: 'text/javascript', body: await fs.readFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'utf8') })
      })
    }
    await page.evaluate(async ({ kind, pdf }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 200; canvas.height = 300
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 300)
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!)))
      const target = kind === 'image' ? new File([blob], 'Ziel.png', { type: 'image/png' })
        : new File([Uint8Array.from(atob(pdf), c => c.charCodeAt(0))], 'Ziel.pdf', { type: 'application/pdf' })
      ;(window as any).setAttachments([new File([blob], 'Start.png', { type: 'image/png' }), target])
    }, { kind, pdf: await pdf.saveAsBase64() })
    await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
    await page.getByRole('button', { name: /Anhang · 2/ }).click()
    await expect(page.getByRole('img', { name: 'Beleg: Start.png' })).toBeVisible()
    await page.evaluate(kind => {
      const state = { flashes: 0, pendingFrames: 0, sawWave: false, stop: false }
      ;(window as any).revealFrames = state
      const sample = () => {
        const preview = document.querySelector('.booking-attachment-preview')
        if (document.querySelector('.attachment-reveal-wave')) state.sawWave = true
        if (preview?.hasAttribute('data-reveal-pending')) {
          state.pendingFrames++
          const media = preview.querySelector('img, canvas')
          let opacity = 1
          for (let el = media; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
          if (media && !state.sawWave && opacity > 0) state.flashes++
        }
        if (!state.stop) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
      if (kind === 'image') {
        // Hold the ready notification after the browser has decoded the image.
        const hold = (event: Event) => {
          const img = event.target
          if (!(img instanceof HTMLImageElement) || img.alt !== 'Beleg: Ziel.png') return
          event.stopImmediatePropagation()
          document.removeEventListener('load', hold, true)
          ;(window as any).releaseImage = () => img.dispatchEvent(new Event('load'))
        }
        document.addEventListener('load', hold, true)
      }
    }, kind)
    await page.getByRole('button', { name: `${kind === 'image' ? 'Ziel.png' : 'Ziel.pdf'} anzeigen`, exact: true }).click()
    if (kind === 'image') {
      await page.waitForFunction(() => typeof (window as any).releaseImage === 'function')
      await expect(page.getByRole('img', { name: 'Beleg: Ziel.png' })).toHaveCSS('opacity', '0')
      await expect.poll(() => page.evaluate(() => (window as any).revealFrames.pendingFrames)).toBeGreaterThan(1)
      await page.evaluate(() => (window as any).releaseImage())
    }
    await expect(page.locator('.attachment-reveal-wave')).toBeVisible()
    await expect(page.locator('.attachment-reveal-wave')).toHaveCount(0)
    const frames = await page.evaluate(() => { (window as any).revealFrames.stop = true; return (window as any).revealFrames })
    expect(frames.pendingFrames).toBeGreaterThan(0)
    expect(frames.flashes).toBe(0)
    await expect(page.locator('.booking-attachment-preview')).toHaveCSS('opacity', '1')
    await expect(page.locator('.booking-attachment-preview').locator('img, canvas')).toHaveCSS('opacity', '1')
  })
}
