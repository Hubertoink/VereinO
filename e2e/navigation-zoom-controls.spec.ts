import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/layout/sidebar.css', 'src/renderer/components/compactPopover.css', 'src/renderer/components/tutorials/pageTutorials.css'].map(file => readFile(file, 'utf8')))).join('\n')
  script = (await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import { AppSidebar } from './src/renderer/components/layout/AppSidebar'
      import { TopNav } from './src/renderer/components/layout/TopNav'
      import PageTutorials from './src/renderer/components/tutorials/PageTutorials'
      import ReceiptZoomControl from './src/renderer/components/ReceiptZoomControl'
      import { getProfileNavigationItems } from './src/renderer/utils/navItems'
      const switches = new Set()
      window.delegatedContextMenus = 0
      document.addEventListener('contextmenu', () => { window.delegatedContextMenus++ })
      window.switchOrg = () => switches.forEach(callback => callback())
      window.api = { app: { version: async () => ({ version: '' }) }, settings: { get: async () => ({ value: true }) }, vouchers: { list: async () => ({ rows: [{ id: 1 }] }) }, organizations: { active: async () => ({ organization: { id: 'nav-test' } }), onSwitched: callback => { switches.add(callback); return () => switches.delete(callback) } } }
      const root = createRoot(document.getElementById('root'))
      window.start = (general = false) => {
        function App() {
          const [top, setTop] = useState(false)
          const [collapsed, setCollapsed] = useState(false)
          const [activePage, setPage] = useState('Buchungen')
          const [bookingView, setBookingView] = useState('classic')
          const [keys, setKeys] = useState(['Dashboard', 'Buchungen', 'Bankimport', 'Einstellungen', 'Reports'])
          const [zoom, setZoom] = useState(1)
          const availableItems = getProfileNavigationItems(general ? 'GENERAL' : 'NONPROFIT')
          const props = { activePage, onNavigate: setPage, navIconColorMode: 'color', availableItems, visibleNavItems: keys, requiredNavItems: new Set(['Dashboard', 'Buchungen', 'Einstellungen']), onVisibleNavItemsChange: setKeys, items: availableItems.filter(item => keys.includes(item.key)) }
          return <div className={'app-root-grid ' + (top ? 'app-root-grid--top' : 'app-root-grid--side')}>
            <header className="app-header">{top && <TopNav {...props} />}</header>
            {!top && <AppSidebar {...props} collapsed={collapsed} onToggleCollapse={() => setCollapsed(value => !value)} />}
            <PageTutorials page={activePage} bookingView={bookingView} setBookingView={setBookingView} openSettings={() => {}} /><output data-testid="booking-view">{bookingView}</output><main className="app-main"><button onClick={() => setTop(value => !value)}>Menü wechseln</button><ReceiptZoomControl value={zoom} onChange={setZoom} /><button>Außerhalb</button><output data-testid="zoom">{zoom}</output></main>
          </div>
        }
        root.render(<App />)
      }
    ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty', '.md': 'text' }, define: { 'process.env.NODE_ENV': '"production"' }
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 800 })
  await page.route('https://controls.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div id="root"></div></html>' }))
  await page.goto('https://controls.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('module selection updates both menus and preserves required modules', async ({ page }, info) => {
  await page.evaluate(() => (window as any).start())
  const menu = page.getByRole('dialog', { name: 'Module anzeigen' })
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click({ button: 'right' })
  await expect(menu).toBeVisible()
  expect(await page.evaluate(() => (window as any).delegatedContextMenus)).toBe(0)
  for (const name of ['Dashboard', 'Buchungen', 'Einstellungen']) await expect(menu.getByRole('checkbox', { name: `${name} in Navigation anzeigen`, exact: true })).toBeDisabled()
  await menu.getByRole('checkbox', { name: 'Reports in Navigation anzeigen' }).uncheck()
  await expect(page.locator('.side-nav').getByRole('button', { name: 'Reports', exact: true })).toHaveCount(0)
  await menu.getByRole('checkbox', { name: 'KI in Navigation anzeigen' }).check()
  await expect(page.locator('.side-nav').getByRole('button', { name: 'KI', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('sidebar-module-menu.png') })
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Menü wechseln' }).click()
  await expect(page.locator('.top-nav').getByRole('button', { name: 'KI', exact: true })).toBeVisible()
  await page.locator('.top-nav').getByRole('button', { name: 'Dashboard', exact: true }).click({ button: 'right' })
  expect(await page.evaluate(() => (window as any).delegatedContextMenus)).toBe(0)
  await expect(menu.getByRole('checkbox', { name: 'Reports in Navigation anzeigen' })).not.toBeChecked()
  await menu.getByRole('checkbox', { name: 'Reports in Navigation anzeigen' }).check()
  await page.screenshot({ path: info.outputPath('top-module-menu.png') })
  await page.getByRole('button', { name: 'Außerhalb' }).click()
  await expect(menu).toHaveCount(0)
  await expect(page.locator('.top-nav').getByRole('button', { name: 'Reports', exact: true })).toBeVisible()
})

test('module popup respects profile, viewport edges and organization switches', async ({ page }) => {
  await page.evaluate(() => (window as any).start(true))
  await page.locator('.app-sidebar').dispatchEvent('contextmenu', { clientX: 1298, clientY: 798 })
  const menu = page.getByRole('dialog', { name: 'Module anzeigen' })
  await expect(menu).toBeInViewport()
  const bounds = (await menu.boundingBox())!
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1292)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(792)
  await expect(menu.getByRole('checkbox', { name: 'Mitglieder in Navigation anzeigen' })).toHaveCount(0)
  await page.evaluate(() => (window as any).switchOrg())
  await expect(menu).toHaveCount(0)
})

for (const layout of ['sidebar', 'collapsed', 'top']) {
  test(`${layout}: booking actions take precedence over module selection`, async ({ page }) => {
    await page.evaluate(() => (window as any).start())
    if (layout === 'top') await page.getByRole('button', { name: 'Menü wechseln' }).click()
    if (layout === 'collapsed') await page.locator('.sidebar-toggle').click()
    const trigger = page.getByRole('button', { name: 'Buchungen', exact: true })
    const actions = page.getByRole('menu', { name: 'Buchungen: Aktionen' })
    const modules = page.getByRole('dialog', { name: 'Module anzeigen' })
    // Clicking the nested SVG must resolve to the same navigation entry.
    await trigger.locator('svg').first().click({ button: 'right' })
    await expect(actions).toBeVisible()
    await expect(modules).toHaveCount(0)
    await actions.getByRole('menuitemradio', { name: 'Plus', exact: true }).click()
    await expect(page.getByTestId('booking-view')).toHaveText('plus')
    await trigger.focus()
    await page.keyboard.press('Shift+F10')
    await expect(actions.getByRole('menuitemradio', { name: 'Plus', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(modules).toHaveCount(0)
    await actions.getByRole('menuitemradio', { name: 'Klassisch', exact: true }).click()
    await expect(page.getByTestId('booking-view')).toHaveText('classic')
    await trigger.click({ button: 'right' })
    await page.keyboard.press('Escape')
    await expect(actions).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.getByRole('button', { name: 'Bankimport', exact: true }).click({ button: 'right' })
    await expect(page.getByRole('menu', { name: 'Bankimport: Aktionen' })).toBeVisible()
    await expect(modules).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click({ button: 'right' })
    await expect(modules).toBeVisible()
    await expect(page.getByRole('menu', { name: 'Buchungen: Aktionen' })).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).delegatedContextMenus)).toBe(0)
  })
}

test('zoom buttons, slider, limits, reset and Escape work together', async ({ page }, info) => {
  await page.evaluate(() => (window as any).start())
  const trigger = page.getByRole('button', { name: 'PDF Zoom einstellen' })
  await trigger.click()
  const menu = page.getByRole('dialog', { name: 'Zoom', exact: true })
  await menu.getByRole('button', { name: 'Vergrößern', exact: true }).click()
  await expect(trigger).toHaveText('110 %')
  await menu.getByRole('button', { name: 'Verkleinern', exact: true }).click()
  await expect(trigger).toHaveText('100 %')
  const slider = menu.getByRole('slider', { name: 'Zoomstufe' })
  await slider.fill('175')
  await expect(page.getByTestId('zoom')).toHaveText('1.75')
  await page.screenshot({ path: info.outputPath('zoom-popup.png') })
  await slider.focus()
  await slider.press('End')
  await expect(trigger).toHaveText('400 %')
  await expect(menu.getByRole('button', { name: 'Vergrößern', exact: true })).toBeDisabled()
  await slider.press('Home')
  await expect(trigger).toHaveText('25 %')
  await expect(menu.getByRole('button', { name: 'Verkleinern', exact: true })).toBeDisabled()
  await menu.getByRole('button', { name: 'Zurücksetzen' }).click()
  await expect(trigger).toHaveText('100 %')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
