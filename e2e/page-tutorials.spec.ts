import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
let script: string
let styles: string
test.beforeAll(async () => {
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import PageTutorials from './src/renderer/components/tutorials/PageTutorials'
    import { TopNav } from './src/renderer/components/layout/TopNav'
    import { SideNav } from './src/renderer/components/layout/SideNav'
    import { signalTutorialEvent } from './src/renderer/utils/pageTutorials'
    window.changes = []; window.org = 'one'
    const fresh = new URLSearchParams(location.search).has('new')
    window.api = {
      organizations: { active: async () => ({ organization: { id: window.org } }), onSwitched: cb => { window.switchOrg = cb; return () => {} } },
      settings: { get: async () => ({ value: !fresh }) },
      vouchers: { list: async () => ({ rows: fresh ? [] : [{ id: 1 }] }) },
      quickAdd: { onSaved: cb => { window.saved = cb; return () => {} } }
    }
    function Harness() {
      const [page, setPage] = useState('Buchungen'), [view, setView] = useState('classic')
      const [modal, setModal] = useState(false), [busy, setBusy] = useState(false)
      const [collapsed, setCollapsed] = useState(false)
      const Navigation = new URLSearchParams(location.search).has('side') ? SideNav : TopNav
      return <><Navigation collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} activePage={page} onNavigate={setPage} navIconColorMode="color" items={[{key:'Buchungen',label:'Buchungen'}, {key:'Bankimport',label:'Bankimport'}, {key:'Einstellungen',label:'Einstellungen'}]} />
        <PageTutorials page={page} bookingView={view} setBookingView={value => { window.changes.push(value); setView(value) }} openSettings={tile => { window.settingsTile = tile; setPage('Einstellungen') }} />
        <main style={{margin:'80px 24px', minHeight:400}}>
        <h1>{page}</h1><output>{view}</output>
        {page === 'Buchungen' && <div data-tutorial={view === 'classic' ? 'classic' : 'plus'} aria-busy={busy} style={{height:300,border:'1px solid var(--border)'}}><button data-tutorial="columns">Spalten</button><p>Buchungsliste</p></div>}
        {page === 'Bankimport' && <div data-tutorial="bank" aria-busy={busy} style={{height:300}}>Bankbelege</div>}
        <button onClick={() => setModal(true)}>Dialog öffnen</button><button onClick={() => setBusy(!busy)}>Laden umschalten</button>
        <button onClick={() => signalTutorialEvent('booking-saved')}>Buchung erfolgreich gespeichert</button>
        <button onClick={() => { signalTutorialEvent('bank-imported'); setModal(true) }}>Import erfolgreich</button>
        </main>{modal && <div role="dialog" aria-modal="true" style={{position:'fixed',inset:200,background:'var(--surface)',zIndex:1000}}><button onClick={() => setModal(false)}>Dialog schließen</button></div>}</>
    }
    createRoot(document.getElementById('root')).render(<Harness />)
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
  styles = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/layout/sidebar.css', 'src/renderer/components/tutorials/pageTutorials.css'].map(path => readFile(path, 'utf8')))).join('\n')
})

async function mount(page: Page, fresh = false, side = false) {
  await page.route('http://help.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark" data-color-theme="earthy-tones"><body><div id="root"></div></body></html>' }))
  await page.goto(`http://help.test/?${fresh ? 'new=1&' : ''}${side ? 'side=1' : ''}`)
  await page.addStyleTag({ content: styles }); await page.addScriptTag({ content: script })
  await expect(page.locator('[data-tutorial="classic"]')).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('vereinO.page-help.v1:one'))).toBe(true)
}
const nav = (page: Page, name: string) => page.locator(`[data-shortcut-nav="${name}"]`)
async function help(page: Page, name = 'Buchungen') {
  await nav(page, name).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Hilfe zu dieser Seite' }).click()
}

test('existing organizations stay quiet; context menu changes only explicitly selected view', async ({ page }) => {
  await mount(page)
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await nav(page, 'Buchungen').click({ button: 'right' })
  await expect(page.getByRole('menuitemradio', { name: 'Klassisch', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'Plus', exact: true }).click()
  await expect(page.locator('output')).toHaveText('plus')
  await help(page)
  await page.getByRole('button', { name: 'Deine Buchungsansicht', exact: true }).click()
  await page.getByLabel('Ansicht ausprobieren').selectOption('classic')
  await expect(page.getByLabel('Vorschau: Klassisch')).toBeVisible()
  await expect(page.locator('output')).toHaveText('plus')
  await page.getByRole('button', { name: 'Ansicht übernehmen' }).click()
  expect(await page.evaluate(() => (window as any).changes)).toEqual(['plus', 'classic'])
})

test('help follows the right-clicked page, and menus support keyboard and Escape', async ({ page }) => {
  await mount(page)
  await nav(page, 'Bankimport').focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menuitem', { name: 'Hilfe zu dieser Seite' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Bankimport kennenlernen' })).toBeFocused()
  await page.getByRole('button', { name: 'Vom Bankbeleg zur Buchung', exact: true }).click()
  await expect(page.locator('.page-help-card')).toContainText('noch keine Buchung')
  await page.keyboard.press('Escape')
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await expect(nav(page, 'Bankimport')).toBeFocused()
})

test('new-user hints wait for loading and dialogs, do not steal focus, and snooze for a day', async ({ page }) => {
  await mount(page, true)
  await page.getByRole('button', { name: 'Laden umschalten' }).click()
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Dialog öffnen' }).click()
  await page.getByRole('button', { name: 'Laden umschalten' }).click()
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Dialog schließen' }).click()
  await nav(page, 'Buchungen').focus()
  await expect(page.getByRole('heading', { name: 'Deine Buchungsansicht' })).toBeVisible()
  await expect(nav(page, 'Buchungen')).toBeFocused()
  await page.getByRole('button', { name: 'Später', exact: true }).click()
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('vereinO.page-help.v1:one')!))
  expect(progress.seen.views).toBe(false)
  expect(progress.later.views).toBeGreaterThan(Date.now() + 23 * 3600000)
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
})

test('dismissal survives reload but manual help remains available', async ({ page }) => {
  await mount(page, true)
  await expect(page.getByRole('heading', { name: 'Deine Buchungsansicht' })).toBeVisible()
  await page.getByRole('button', { name: 'Nicht mehr anzeigen' }).click()
  await page.reload(); await page.addStyleTag({ content: styles }); await page.addScriptTag({ content: script })
  await expect(page.getByRole('heading', { name: 'Die Tabelle passend einrichten' })).toBeVisible()
  await help(page)
  await page.getByRole('button', { name: 'Deine Buchungsansicht', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Deine Buchungsansicht' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vereinO.page-help.v1:one')!).dismissed.views)).toBe(true)
})

test('bank guidance waits for a successful import and closing its dialog', async ({ page }) => {
  await mount(page, true)
  await nav(page, 'Bankimport').click()
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Import erfolgreich', exact: true }).click()
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Dialog schließen' }).click()
  await expect(page.getByRole('heading', { name: 'Vom Bankbeleg zur Buchung' })).toBeVisible()
})

test('workflow tip reacts to creation, not detached edits, and links to workflow settings', async ({ page }) => {
  await mount(page, true)
  await expect(page.getByRole('heading', { name: 'Deine Buchungsansicht' })).toBeVisible()
  await page.getByRole('button', { name: 'Nicht mehr anzeigen' }).click()
  await page.evaluate(() => (window as any).saved({ mode: 'edit', id: 4 }))
  await page.waitForTimeout(2200)
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await page.evaluate(() => (window as any).saved({ mode: 'create', id: 5 }))
  await expect(page.getByRole('heading', { name: 'So erfasst du am liebsten' })).toBeVisible()
  await help(page)
  await page.getByRole('button', { name: 'So erfasst du am liebsten', exact: true }).click()
  await page.getByRole('button', { name: 'Workflow-Einstellungen öffnen' }).click()
  expect(await page.evaluate(() => (window as any).settingsTile)).toBe('workflow')
})

test('organization switch isolates progress and removes an open hint', async ({ page }) => {
  await mount(page, true)
  await expect(page.getByRole('heading', { name: 'Deine Buchungsansicht' })).toBeVisible()
  await page.getByRole('button', { name: 'Nicht mehr anzeigen' }).click()
  await help(page)
  await page.evaluate(() => { (window as any).org = 'two'; (window as any).switchOrg() })
  await expect(page.locator('.page-help-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Deine Buchungsansicht' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vereinO.page-help.v1:two')!).dismissed.views)).toBeUndefined()
})

test('cards and context menus fit narrow light/dark windows with reduced motion', async ({ page }, testInfo) => {
  await mount(page)
  await page.setViewportSize({ width: 390, height: 600 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.removeAttribute('data-color-theme') }, theme)
    await help(page)
    await page.getByRole('button', { name: 'Deine Buchungsansicht', exact: true }).click()
    await expect.poll(async () => { const box = await page.locator('.page-help-card').boundingBox(); return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 600 }).toBe(true)
    expect(await page.locator('.page-help-card').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
    await page.locator('.page-help-card').screenshot({ path: testInfo.outputPath(`help-${theme}.png`) })
    await page.getByRole('button', { name: 'Hilfe schließen' }).click()
  }
})

test('sidebar header and its collapsed icon expose the same context actions', async ({ page }, testInfo) => {
  await mount(page, false, true)
  await nav(page, 'Buchungen').locator('.icon-wrapper').click({ button: 'right' })
  await expect(page.getByRole('menuitemradio', { name: 'Klassisch', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.locator('.page-help-menu').screenshot({ path: testInfo.outputPath('navigation-menu.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Seitenleiste einklappen', exact: true }).click()
  await help(page)
  await expect(page.getByRole('heading', { name: 'Buchungen kennenlernen' })).toBeVisible()
  await page.getByRole('button', { name: 'Hilfe schließen' }).click()
  await nav(page, 'Buchungen').click({ button: 'right' })
  await page.getByRole('menuitemradio', { name: 'Plus', exact: true }).click()
  await expect(page.locator('output')).toHaveText('plus')
})

test('tutorial placement keeps its control free at edges and after resizing', async ({ page }, testInfo) => {
  await mount(page)
  await page.setViewportSize({ width: 1100, height: 720 })
  await page.locator('[data-tutorial="columns"]').evaluate(node => { Object.assign((node as HTMLElement).style, { position: 'fixed', right: '16px', top: '60px', width: '36px', height: '36px' }) })
  await help(page)
  await page.getByRole('button', { name: 'Die Tabelle passend einrichten', exact: true }).click()
  const separated = async () => {
    const card = await page.locator('.page-help-card').boundingBox()
    const anchor = await page.locator('[data-tutorial="columns"]').boundingBox()
    const viewport = page.viewportSize()!
    return !!card && !!anchor && card.x >= 0 && card.y >= 0 && card.x + card.width <= viewport.width && card.y + card.height <= viewport.height && (
      card.x + card.width <= anchor.x - 12 || card.x >= anchor.x + anchor.width + 12 || card.y + card.height <= anchor.y - 12 || card.y >= anchor.y + anchor.height + 12
    )
  }
  await expect.poll(separated).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('columns-right-edge.png') })
  await page.setViewportSize({ width: 390, height: 600 })
  await expect.poll(separated).toBe(true)
  await page.locator('[data-tutorial="columns"]').evaluate(node => { (node as HTMLElement).style.top = '280px' })
  await expect.poll(separated).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('columns-narrow.png') })
  await page.setViewportSize({ width: 390, height: 360 })
  await expect.poll(separated).toBe(true)
  await page.getByRole('button', { name: 'Zur Übersicht', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Buchungen kennenlernen' })).toBeVisible()
})
