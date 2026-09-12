import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let styles: string

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import SetupWizardModal from './src/renderer/components/modals/SetupWizardModal'
      const noop = () => {}
      window.api = { settings: { get: async () => ({ value: '' }), set: async () => ({}) } }
      localStorage.setItem('journalCols', 'existing-columns')
      localStorage.setItem('journalColsOrder', 'existing-order')
      function Harness() {
        const [bookingView, setBookingView] = useState('plus')
        return <SetupWizardModal bookingView={bookingView} setBookingView={setBookingView}
          onClose={() => { window.setupClosed = true }} notify={noop} existingTags={[]}
          navLayout="top" setNavLayout={noop} navIconColorMode="color" setNavIconColorMode={noop}
          colorTheme="default" setColorTheme={noop} journalRowStyle="both" setJournalRowStyle={noop}
          journalRowDensity="compact" setJournalRowDensity={noop} backgroundImage="none" setBackgroundImage={noop}
          customBackgroundImage={null} setCustomBackgroundImage={noop} glassModals={false} setGlassModals={noop}
          dateFmt="DOT" setDateFmt={noop} showBookingDraftTabs={false} setShowBookingDraftTabs={noop}
          showBookingEditTabs={false} setShowBookingEditTabs={noop} bookingEntryPresentation="flyout" setBookingEntryPresentation={noop}
          allowVoucherDeletion={false} setAllowVoucherDeletion={noop} quickAddAfterSave="close" setQuickAddAfterSave={noop} />
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
  styles = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modals/setupBookingView.css'].map(path => readFile(path, 'utf8')))).join('\n')
})

for (const view of ['plus', 'classic'] as const) {
  test(`setup saves ${view} and only writes columns for classic`, async ({ page }) => {
    await page.route('http://setup.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
    await page.goto('http://setup.test/')
    await page.setViewportSize({ width: 1280, height: 950 })
    await page.addStyleTag({ content: styles + ':root { --surface: #171e1a; --bg: #111713; --text: #eeecea; --text-dim: #bcbdb6; --border: #344038; --accent: #edb1bd; --table-row-alt: #202923; } body { color: var(--text); background: var(--bg); }' })
    await page.addScriptTag({ content: script })
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Buchungen Plus' })).toBeChecked()
    await expect(page.getByText('Spalten-Preset', { exact: true })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Buchungen klassisch' }).check()
    await expect(page.getByText('Spalten-Preset', { exact: true })).toBeVisible()
    if (view === 'plus') {
      await page.getByRole('radio', { name: 'Buchungen Plus' }).check()
      await expect(page.getByText('Zeilenhöhe', { exact: true })).toHaveCount(0)
      await page.screenshot({ path: 'test-results/setup-booking-plus.png' })
      await page.setViewportSize({ width: 760, height: 950 })
      const cards = await page.locator('.setup-booking-choice').all()
      const first = await cards[0].boundingBox()
      const second = await cards[1].boundingBox()
      expect(second!.y).toBeGreaterThan(first!.y + first!.height)
    }
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await expect(page.locator('.setup-summary-grid')).toContainText(view === 'plus' ? 'Buchungen Plus' : 'Buchungen klassisch')
    await page.getByRole('button', { name: 'Fertig', exact: true }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ui.bookingView'))).toBe(view)
    const columns = await page.evaluate(() => localStorage.getItem('journalCols'))
    if (view === 'plus') {
      expect(columns).toBe('existing-columns')
      expect(await page.evaluate(() => localStorage.getItem('journalColsOrder'))).toBe('existing-order')
    } else expect(JSON.parse(columns!)).toMatchObject({ date: true, description: true, gross: true })
  })
}
