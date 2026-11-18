import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string

test.beforeAll(async () => {
  css = (await Promise.all([
    'src/renderer/styles.css', 'src/renderer/components/modalHeader.css',
    'src/renderer/components/layout/sidebar.css'
  ].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const bundle = await build({ jsx: 'automatic', stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { AppSidebar } from './src/renderer/components/layout/AppSidebar'
    import { UpdateNoticeContext } from './src/renderer/context/UpdateNoticeContext'
    import UpdateAvailableModal from './src/renderer/components/modals/UpdateAvailableModal'
    window.updateCalls = { download: 0, install: 0 }
    window.api = { app: { version: async () => ({version: '5.2.2'}) }, organizations: { onSwitched: () => () => {} } }
    function Harness() {
      const [version, setVersion] = useState(null)
      const [collapsed, setCollapsed] = useState(false)
      const [prompt, setPrompt] = useState(false)
      const [status, setStatus] = useState('available')
      window.setAvailableUpdate = setVersion
      window.setUpdateStatus = setStatus
      return <UpdateNoticeContext.Provider value={{ version, openUpdate: () => setPrompt(true) }}>
        <div className="app-root-grid app-root-grid--side">
          <AppSidebar activePage="Dashboard" onNavigate={() => {}} collapsed={collapsed} onToggleCollapse={() => setCollapsed(value => !value)} navIconColorMode="color" items={[{key:'Einstellungen',label:'Einstellungen',group:'system'}]} />
          <main className="app-main">VereinO</main>
        </div>
        {prompt && <UpdateAvailableModal state={{status, currentVersion:'5.2.2', availableVersion:version, downloadedVersion:status === 'downloaded' ? version : null, downloadProgress:status === 'downloading' ? 42 : null, message:null}}
          onClose={() => setPrompt(false)} onDownload={async () => { window.updateCalls.download++; setStatus('downloading') }}
          onInstall={async () => { window.updateCalls.install++ }} onDisable={async () => {}} />}
      </UpdateNoticeContext.Provider>
    }
    createRoot(document.getElementById('root')).render(<Harness />)
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css':'empty', '.md':'text' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = bundle.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('http://updates.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark" data-color-theme="earthy-tones"><div id="root"></div></html>' }))
  await page.goto('http://updates.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('update notification appears live in the sidebar and changelog, opens the update dialog without starting a download', async ({ page }) => {
  const version = page.locator('.sidebar-version')
  await expect(version).toBeVisible()
  await expect(version).not.toHaveClass(/sidebar-version--update/)
  await version.click()
  await expect(page.getByRole('button', {name: 'Update verfügbar', exact: true})).toHaveCount(0)
  await page.evaluate(() => (window as any).setAvailableUpdate('5.2.3'))
  await expect(version).toHaveClass(/sidebar-version--update/)
  await expect(version).toHaveAttribute('title', /Update 5.2.3 verfügbar/)
  await expect(page.locator('.changelog-version-badge')).toHaveClass(/changelog-version-badge--update/)
  const update = page.getByRole('button', {name: 'Update verfügbar', exact: true})
  const button = await update.boundingBox()
  const close = await page.locator('.changelog-modal .modal-close-button').boundingBox()
  expect(button!.x + button!.width).toBeLessThan(close!.x)
  await update.click()
  await expect(page.locator('.changelog-modal')).toHaveCount(0)
  await expect(page.locator('.update-modal')).toBeVisible()
  await expect(page.locator('.update-modal')).toContainText('VereinO 5.2.3')
  expect(await page.evaluate(() => (window as any).updateCalls)).toEqual({download:0, install:0})
  await page.getByRole('button', {name:'Download starten'}).click()
  await expect(page.getByRole('button', {name:'Download läuft...'})).toBeDisabled()
  await page.locator('.update-modal .modal-close-button').click()
  await page.evaluate(() => (window as any).setUpdateStatus('downloaded'))
  await version.click()
  await update.click()
  await expect(page.getByRole('button', {name:'Installieren', exact:true})).toBeVisible()
  expect(await page.evaluate(() => (window as any).updateCalls.install)).toBe(0)
  await page.locator('.update-modal .modal-close-button').click()
  await version.click()
  await page.evaluate(() => (window as any).setAvailableUpdate(null))
  await expect(update).toHaveCount(0)
  await expect(version).not.toHaveClass(/sidebar-version--update/)
  await expect(page.locator('.changelog-version-badge')).not.toHaveClass(/changelog-version-badge--update/)
})

for (const theme of ['light', 'dark']) {
  test(`update controls fit the collapsed sidebar and narrow changelog (${theme})`, async ({ page }, testInfo) => {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.colorTheme = theme === 'dark' ? 'earthy-tones' : 'professional-light'; (window as any).setAvailableUpdate('5.2.3') }, theme)
    await page.getByRole('button', {name:'Seitenleiste einklappen'}).click()
    const version = page.locator('.sidebar-version')
    await expect(version).toHaveText('v5.2.2')
    await expect(version).toHaveClass(/sidebar-version--update/)
    expect(await version.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({animations:'disabled', path:testInfo.outputPath(`sidebar-update-${theme}.png`)})
    for (const width of [1280, 600, 390]) {
      await page.setViewportSize({width, height:800})
      await version.click()
      const modal = page.locator('.changelog-modal')
      await expect(modal).toBeVisible()
      await expect(page.getByRole('button', {name:'Update verfügbar', exact:true})).toBeInViewport()
      await expect(modal.locator('.modal-close-button')).toBeInViewport()
      expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      if (width !== 600) await page.screenshot({animations:'disabled', path:testInfo.outputPath(`changelog-update-${theme}-${width}.png`)})
      await modal.locator('.modal-close-button').click()
    }
  })
}
