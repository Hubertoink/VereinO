import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

for (const presentation of ['expanded', 'detached'] as const) {
  for (const notification of ['normal', 'pending', 'rejected'] as const) {
    test(`${presentation}: save and new survives ${notification} notification`, async ({}, testInfo) => {
      const userData = testInfo.outputPath('user-data')
      await fs.mkdir(userData, { recursive: true })
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const app = await electron.launch({
        args: [path.resolve('dist-electron/main/index.cjs'), `--user-data-dir=${userData}`],
        env: { ...env, ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString() }
      })
      try {
        const main = await app.firstWindow()
        await expect(main.locator('[data-shortcut-nav="Dashboard"]')).toBeVisible({ timeout: 30_000 })
        const later = main.getByRole('button', { name: 'Später', exact: true })
        await later.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
        if (await later.isVisible()) await later.click()
        if (notification !== 'normal') {
          await app.evaluate(({ ipcMain }, mode) => {
            ipcMain.removeHandler('quickAdd.notifySaved')
            ipcMain.handle('quickAdd.notifySaved', () => {
              if (mode === 'rejected') throw new Error('Test: Benachrichtigung fehlgeschlagen')
              return new Promise(() => {})
            })
          }, notification)
        }
        await main.keyboard.press('Alt+n')
        await main.getByRole('button', { name: 'Vollständigen Buchungsdialog öffnen', exact: true }).click()
        let page = main
        if (presentation === 'detached') {
          const detached = app.waitForEvent('window')
          await main.getByRole('button', { name: 'In eigenes Fenster abdocken', exact: true }).click()
          page = await detached
        }
        const dialog = page.locator('.quick-add-modal')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Einnahme', exact: true }).click()
        await dialog.locator('#quick-add-date').fill('2026-10-08')
        await dialog.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('25')
        await dialog.getByRole('button', { name: 'Weitere Speicheraktionen' }).click()
        await dialog.getByRole('menuitem', { name: 'Speichern & neu', exact: true }).click()

        // The next draft must be ready even while notification never settles.
        await expect(dialog).toBeVisible()
        await expect(dialog.locator('#quick-add-date')).toHaveValue('')
        await expect(dialog.locator('#quick-add-amount')).toHaveValue('')
        await expect(page.locator('.compact-booking-flyout')).toHaveCount(0)
        await expect.poll(() => main.evaluate(async () => (await window.api.vouchers.list({ limit: 1 })).total)).toBe(1)
        await dialog.getByRole('button', { name: 'Einnahme', exact: true }).click()
        await expect(dialog.locator('#quick-add-date')).toBeFocused()

        // Closing after a second save also succeeds, and a fresh entry uses the flyout again.
        await dialog.locator('#quick-add-date').fill('2026-10-08')
        await dialog.getByRole('spinbutton', { name: 'Brutto-Betrag' }).fill('30')
        await dialog.getByRole('button', { name: 'Weitere Speicheraktionen' }).click()
        await dialog.getByRole('menuitem', { name: 'Speichern & schließen', exact: true }).click()
        if (presentation === 'detached') await expect.poll(() => page.isClosed()).toBe(true)
        else await expect(dialog).toHaveCount(0)
        await expect.poll(() => main.evaluate(async () => (await window.api.vouchers.list({ limit: 1 })).total)).toBe(2)
        await main.keyboard.press('Alt+n')
        await expect(main.locator('.compact-booking-flyout')).toBeVisible()
      } finally {
        await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
      }
    })
  }
}
