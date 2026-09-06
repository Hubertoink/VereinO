import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('customer creation stays above the booking flyout and preserves the booking draft', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-party-booking-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [path.resolve('dist-electron/main/index.cjs'), `--user-data-dir=${userData}`],
    env: { ...env, ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString() }
  })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('[data-shortcut-nav="Dashboard"]')).toBeVisible({ timeout: 30_000 })
    const later = page.getByRole('button', { name: 'Später', exact: true })
    await later.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
    if (await later.isVisible()) await later.click()
    await page.evaluate(() => localStorage.setItem('ui.showBookingDraftTabs', 'true'))
    await page.reload()
    await expect(page.locator('[data-shortcut-nav="Dashboard"]')).toBeVisible()
    await page.keyboard.press('Alt+n')
    const flyout = page.locator('.compact-booking-flyout')
    await page.setViewportSize({ width: 629, height: 680 })
    await expect(flyout.getByText('Kompakte Erfassung', { exact: true })).toHaveCount(0)
    const heading = await flyout.locator('#compact-booking-title').boundingBox()
    const switcher = await flyout.getByRole('button', { name: 'Buchungsreiter wechseln' }).boundingBox()
    expect(Math.abs((heading!.y + heading!.height / 2) - (switcher!.y + switcher!.height / 2))).toBeLessThan(3)
    const footer = flyout.locator('.compact-booking-flyout__footer')
    const hint = await footer.locator('.compact-booking-required').boundingBox()
    const saveButton = await footer.getByRole('button', { name: 'Buchung speichern' }).boundingBox()
    expect(hint).not.toBeNull()
    expect(saveButton).not.toBeNull()
    expect(Math.abs((hint!.y + hint!.height / 2) - (saveButton!.y + saveButton!.height / 2))).toBeLessThan(3)
    await expect(footer.getByText('Betrag', { exact: true })).toBeVisible()
    await flyout.locator('.amount-input').fill('350')
    await expect(footer.getByText('Betrag', { exact: true })).toHaveCount(0)
    await flyout.getByRole('button', { name: '+ Kunde', exact: true }).click()
    const input = flyout.getByRole('combobox', { name: 'Kunde oder Zahlungspflichtiger' })
    await input.fill('Neuer Testkunde')
    await input.press('Enter')
    const editor = page.getByRole('dialog', { name: 'Geschäftspartner anlegen' })
    await expect(editor).toBeVisible()
    // 960×540 at 150% zoom leaves a 640×360 CSS viewport.
    // Emulate it directly so a tiling compositor cannot override test bounds.
    await page.setViewportSize({ width: 640, height: 360 })
    await expect(editor.locator('.party-editor-extra[open]')).toHaveCount(0)
    const assertFits = async () => {
      await expect.poll(() => editor.locator('.party-editor-modal').evaluate(element => {
        const rect = element.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
      })).toBe(true)
      await expect.poll(() => editor.getByRole('button', { name: 'Speichern', exact: true }).evaluate(element => {
        const rect = element.getBoundingClientRect()
        return rect.bottom <= innerHeight && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      })).toBe(true)
    }
    await assertFits()
    await page.screenshot({ path: 'test-results/party-editor-compact.png' })
    await editor.getByText('Kontakt & Anschrift', { exact: true }).click()
    await editor.getByLabel('E-Mail', { exact: true }).fill('kunde@example.org')
    await editor.getByText('Zahlung & Steuer', { exact: true }).click()
    await assertFits()
    // Pointer interaction in the customer dialog must not park the booking.
    await editor.getByLabel('Name *', { exact: true }).click()
    await expect(flyout).toBeVisible()
    await editor.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(flyout).toBeVisible()
    await expect(input).toHaveValue('Neuer Testkunde')
    await expect(flyout.locator('.amount-input')).toHaveValue('350')
    const counts = await page.evaluate(async () => ({
      parties: (await window.api.parties.list({ q: 'Neuer Testkunde' })).rows.length,
      vouchers: (await window.api.vouchers.list({ limit: 1 })).total
    }))
    expect(counts).toEqual({ parties: 1, vouchers: 0 })
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await fs.rm(userData, { recursive: true, force: true })
  }
})
