import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('Alt+N opens a booking flyout from other pages and foreground dialogs', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-shortcuts-'))
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
    await page.keyboard.press('Alt')
    await expect(page.locator('.shortcut-badge[aria-label^="Dashboard:"]')).toBeVisible()
    await page.keyboard.press('Escape')
    // A foreground editor must not block the fixed global combination.
    await page.evaluate(() => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.style.cssText = 'position:fixed;inset:0;z-index:14000;background:#222'
      dialog.innerHTML = '<input aria-label="Vorhandener Entwurf" value="Unverändert">'
      document.body.append(dialog)
      dialog.querySelector('input')!.focus()
    })
    await page.keyboard.press('Alt+n')
    const flyout = page.locator('.compact-booking-flyout')
    await expect(flyout).toBeVisible()
    await expect(page.locator('.compact-booking-flyout-anchor--shortcut')).toHaveCount(1)
    await expect(page.getByRole('textbox', { name: 'Vorhandener Entwurf' })).toHaveValue('Unverändert')
    await expect.poll(() => flyout.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })).toBe(true)
    await page.keyboard.press('Alt')
    await expect(page.locator('.shortcut-badge')).not.toHaveCount(0)
    await expect(page.locator('.shortcut-global-flyout')).toBeVisible()
    await expect(page.locator('.shortcut-global-flyout')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: 'test-results/shortcut-booking-flyout.png', animations: 'disabled' })
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await fs.rm(userData, { recursive: true, force: true })
  }
})
