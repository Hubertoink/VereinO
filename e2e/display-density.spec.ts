import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
let bootstrap: string

test.beforeAll(async () => {
  css = (await Promise.all([
    'src/renderer/styles.css',
    'src/renderer/views/Settings/settings.css'
  ].map(file => fs.readFile(file, 'utf8')))).join('\n')
  bootstrap = await fs.readFile('src/renderer/public/ui-density.js', 'utf8')
  script = (await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { UIPreferencesProvider } from './src/renderer/context/UIPreferences'
      import { useUIPreferences } from './src/renderer/context/useUIPreferences'
      import { GeneralPane } from './src/renderer/views/Settings/panes/GeneralPane'
      window.api = { settings: { get: async () => ({ value: null }) } }
      function Fixture() {
        const preferences = useUIPreferences()
        return <main className="settings-container"><div className="settings-content settings-unified">
          <GeneralPane {...preferences} organizationProfile="GENERAL" visibleNavItems={['Dashboard', 'Buchungen', 'Einstellungen']}
            setVisibleNavItems={() => {}} notify={() => {}} openSetupWizard={() => {}} />
        </div></main>
      }
      createRoot(document.getElementById('root')).render(<UIPreferencesProvider><Fixture /></UIPreferencesProvider>)
    ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"http://density.test/module.js"' },
    logOverride: { 'empty-import-meta': 'silent' }
  })).outputFiles[0].text
})

async function open(page: Page) {
  await page.route('http://density.test/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/ui-density.js') return route.fulfill({ contentType: 'application/javascript', body: bootstrap })
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: script })
    if (pathname === '/styles.css') return route.fulfill({ contentType: 'text/css', body: css })
    return route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><head><script src="/ui-density.js"></script><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' })
  })
  await page.goto('http://density.test/')
  await expect(page.getByRole('group', { name: 'Darstellungsgröße' })).toBeVisible()
}

test('compact is the default; standard restores text and spacing and survives reopening', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await open(page)
  const preview = page.getByLabel('Vorschau der Darstellungsgröße')
  const options = page.getByRole('group', { name: 'Darstellungsgröße' })
  await expect(options.getByRole('button', { name: 'Kompakt' })).toHaveAttribute('aria-pressed', 'true')
  await expect(preview).toHaveCSS('font-size', '12px')
  const compactHeight = (await preview.boundingBox())!.height
  await page.screenshot({ path: info.outputPath('compact.png'), animations: 'disabled' })
  await options.getByRole('button', { name: 'Standard' }).click()
  await expect(preview).toHaveCSS('font-size', '16px')
  expect((await preview.boundingBox())!.height).toBeGreaterThan(compactHeight)
  expect(await page.evaluate(() => localStorage.getItem('ui.displayDensity'))).toBe('standard')
  await page.reload()
  await expect(preview).toHaveCSS('font-size', '16px')
  await expect(options.getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true')
  await options.getByRole('button', { name: 'Kompakt' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.locator('.settings-content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('compact-narrow.png'), animations: 'disabled' })
  await page.emulateMedia({ media: 'print' })
  await expect(preview).toHaveCSS('font-size', '16px')
  await page.emulateMedia({ media: 'screen' })
  await expect(preview).toHaveCSS('font-size', '12px')
  expect(errors).toEqual([])
})

test('open windows synchronize density and newly opened windows apply it before React mounts', async ({ page, context }) => {
  await open(page)
  const other = await context.newPage()
  await open(other)
  await page.getByRole('group', { name: 'Darstellungsgröße' }).getByRole('button', { name: 'Standard', exact: true }).click()
  await expect(other.getByRole('group', { name: 'Darstellungsgröße' }).getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(other.getByLabel('Vorschau der Darstellungsgröße')).toHaveCSS('font-size', '16px')
  await other.route('http://density.test/fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await other.reload()
  await expect(other.locator('html')).toHaveAttribute('data-ui-density', 'standard')
  await other.evaluate(() => localStorage.removeItem('ui.displayDensity'))
  await expect(page.getByRole('button', { name: 'Kompakt', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await other.close()
})

test('an invalid saved density falls back to compact', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.displayDensity', 'obsolete'))
  await open(page)
  await expect(page.locator('html')).toHaveAttribute('data-ui-density', 'compact')
  await expect(page.getByLabel('Vorschau der Darstellungsgröße')).toHaveCSS('font-size', '12px')
})
