import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string

test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8') + '\n' + await fs.readFile('src/renderer/components/modals/quickAddLayout.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/booking/bankDraftSource.css', 'utf8') + '\n' + await fs.readFile('src/renderer/components/compactBookingFlyout.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/common/party.css', 'utf8')
  css += '\n' + await fs.readFile('src/renderer/components/modalHeader.css', 'utf8')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { useQuickAdd } from './src/renderer/hooks/useQuickAdd'
      import { resolveBankDraftParty } from './src/renderer/utils/bankDraftParty'
      import { bankDraftSourceFromTransaction } from './src/renderer/types/bankDraftSource'
      import { selectAiDraftBookingType } from './src/renderer/utils/aiBookingDraft'
      import QuickAddModal from './src/renderer/components/modals/QuickAddModal'
      import CompactBookingFlyout from './src/renderer/components/CompactBookingFlyout'
      function Harness() {
        const hook = useQuickAdd('2026-09-25', async () => ({ id: 1 }), undefined, undefined, true)
        const [presentation, setPresentation] = React.useState('flyout')
        const fileInputRef = React.useRef(null)
        window.changePresentation = setPresentation
        window.currentQa = hook.qa
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
        const props = { qa: hook.qa, setQa: hook.setQa, onSave: hook.onQuickSave, onClose: hook.parkQuickAdd,
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
      createRoot(document.getElementById('root')).render(<Harness />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(error.message))
  await page.route('http://booking.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div id="root"></div></html>' }))
  await page.goto('http://booking.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' })
  await page.addScriptTag({ content: script })
  await expect(page.getByRole('group', { name: 'Buchungsart wählen' })).toBeVisible()
})

for (const presentation of ['flyout', 'modal', 'detached']) {
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
    for (const size of [{ width: 1440, height: 1200 }, { width: 1280, height: 720 }, { width: 600, height: 800 }]) {
      await page.setViewportSize(size)
      for (const expanded of [false, true]) {
        if (expanded) await editor.locator('details').filter({ hasText: 'Kommentar' }).locator('summary').click()
        const bounds = (await editor.boundingBox())!
        const footerBounds = (await footer.boundingBox())!
        expect(Math.abs(bounds.y + bounds.height - footerBounds.y - footerBounds.height)).toBeLessThanOrEqual(2)
        expect(footerBounds.y).toBeGreaterThan(bounds.y)
        const close = (await editor.getByRole('button', { name: 'Schließen', exact: true }).boundingBox())!
        if (presentation === 'detached') {
          expect(Math.abs(close.x + close.width - bounds.x - bounds.width)).toBeLessThanOrEqual(2)
          expect(Math.abs(close.y - bounds.y)).toBeLessThanOrEqual(2)
        } else {
          expect(bounds.x + bounds.width - close.x - close.width).toBeCloseTo(15, 0)
          expect(close.width).toBe(34)
          expect(close.height).toBe(32)
          const header = (await editor.locator('.modal-header-bar').boundingBox())!
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

  test(`${presentation}: save is disabled until date and amount are complete`, async ({ page }) => {
    await page.evaluate(value => (window as any).changePresentation(value), presentation)
    await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
    const save = page.getByRole('button', { name: 'Speichern', exact: true })
    const menu = page.getByRole('button', { name: 'Weitere Speicheraktionen' })
    await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(0)
    await page.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('25')
    await expect(save).toBeDisabled()
    await expect(menu).toBeDisabled()
    const disabledBackground = await save.evaluate(button => getComputedStyle(button).backgroundColor)
    await page.locator('#quick-add-date').fill('2026-10-08')
    await expect(save).toBeEnabled()
    await expect(menu).toBeEnabled()
    expect(await save.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe(disabledBackground)
    await page.locator('#quick-add-amount').fill('0')
    await expect(save).toBeDisabled()
    await page.locator('#quick-add-amount').fill('25')
    await page.locator('#quick-add-date').fill('')
    await expect(save).toBeDisabled()
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
