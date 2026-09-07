import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

let componentScript: string

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { LeaderShortcuts } from './src/renderer/components/shortcuts/LeaderShortcuts'
        createRoot(document.getElementById('root')).render(
          <LeaderShortcuts commands={[{ key: 'b', label: 'Buchungen', action: () => {
            document.getElementById('result').textContent = 'Buchungen'
          }}]} />
        )
      `,
      resolveDir: process.cwd(),
      loader: 'tsx'
    },
    bundle: true,
    write: false,
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  componentScript = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setContent('<button id="nav">Buchungen</button><input id="input"><div id="root"></div><div id="result"></div>')
  await page.addScriptTag({ content: componentScript })
  await expect(page.locator('.leader-shortcut-trigger')).toBeVisible()
  await page.locator('#nav').click()
})

test('standalone Alt toggles after a navigation click and commands still work', async ({ page }) => {
  const guide = page.getByRole('dialog', { name: 'Tastaturbefehle', exact: true })
  await page.keyboard.down('Alt')
  await expect(guide).toHaveCount(0)
  await page.keyboard.up('Alt')
  await expect(guide).toBeVisible()
  await page.keyboard.press('Alt')
  await expect(guide).toHaveCount(0)
  await page.keyboard.press('Alt')
  await page.keyboard.press('b')
  await expect(page.locator('#result')).toHaveText('Buchungen')
  await expect(guide).toHaveCount(0)
})

test('Alt combinations do not toggle or execute commands', async ({ page }) => {
  const guide = page.getByRole('dialog', { name: 'Tastaturbefehle', exact: true })
  await page.keyboard.press('Alt+Tab')
  await expect(guide).toHaveCount(0)
  await page.locator('#nav').click()
  await page.keyboard.press('Alt')
  await expect(guide).toBeVisible()
  await page.keyboard.press('Alt+b')
  await page.keyboard.press('Alt+Tab')
  await expect(guide).toBeVisible()
  await expect(page.locator('#result')).toBeEmpty()
  await page.keyboard.press('Escape')
  await expect(guide).toHaveCount(0)
})

test('focus loss cancels Alt even when the OS consumes Tab', async ({ page }) => {
  await page.keyboard.down('Alt')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('Alt')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Alt')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('key repeat toggles only once and AltGr does not toggle', async ({ page }) => {
  await page.keyboard.press('Control+Alt')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.down('Alt')
  await page.keyboard.down('Alt')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.up('Alt')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('inputs and blocking dialogs still suppress Alt', async ({ page }) => {
  await page.locator('#input').focus()
  await page.keyboard.press('Alt')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('#nav').focus()
  await page.evaluate(() => {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    document.body.append(modal)
  })
  await page.keyboard.press('Alt')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
