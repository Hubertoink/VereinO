import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string

test.beforeAll(async () => {
  css = await fs.readFile('src/renderer/styles.css', 'utf8') + '\n' + await fs.readFile('src/renderer/components/modals/quickAddLayout.css', 'utf8')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { useQuickAdd } from './src/renderer/hooks/useQuickAdd'
      import QuickAddModal from './src/renderer/components/modals/QuickAddModal'
      import CompactBookingFlyout from './src/renderer/components/CompactBookingFlyout'
      function Harness() {
        const hook = useQuickAdd('2026-09-25', async () => ({ id: 1 }), undefined, undefined, true)
        const [presentation, setPresentation] = React.useState('flyout')
        const fileInputRef = React.useRef(null)
        window.changePresentation = setPresentation
        window.newDraft = () => hook.openQuickAdd()
        window.parkDraft = hook.parkQuickAdd
        window.replaceDraft = () => hook.updateDraft(hook.activeDraftId, { qa: { type: 'OUT',
          date: '2026-09-25', grossAmount: 75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL', description: 'Beleg', paymentAccountId: 1 } })
        window.reopenDraft = () => hook.reopenDraft(hook.activeDraftId)
        window.prefill = (selected) => hook.openQuickAdd({ qa: { type: 'OUT', bookingTypeSelected: selected,
          date: '2026-09-25', grossAmount: 75, mode: 'GROSS', vatRate: 0, sphere: 'IDEELL', description: 'Vorbelegt', paymentAccountId: 1 } })
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

test('replacing draft data preserves whether the type has been selected', async ({ page }) => {
  await page.evaluate(() => (window as any).replaceDraft())
  await expect(page.locator('.booking-type-fields')).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Ausgabe', exact: true }).click()
  await expect(page.locator('input[type=date]').first()).toHaveValue('2026-09-25')
  await page.evaluate(() => (window as any).replaceDraft())
  await expect(page.locator('input[type=date]').first()).toBeVisible()
})
