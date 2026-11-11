import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

let script: string
let scrollLockCss: string
let dropdownCss: string
test.beforeAll(async () => {
  const stylesheet = await fs.readFile('src/renderer/styles.css', 'utf8')
  scrollLockCss = stylesheet.match(/\.overlay-scroll-(?:locked|gutter)\s*\{[^}]*\}/g)!.join('\n')
  dropdownCss = (stylesheet.match(/[^{}]+\{[^{}]*\}/g) || []).filter(rule => rule.split('{')[0].includes('.select-dropdown__')).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { useOverlayScrollLock } from './src/renderer/hooks/useOverlayScrollLock'
    import InvoiceAnalysisInfo from './src/renderer/components/modals/InvoiceAnalysisInfo'
    import FilterDropdown from './src/renderer/components/dropdowns/FilterDropdown'
    import SelectDropdown from './src/renderer/components/common/SelectDropdown'
    function App() {
      useOverlayScrollLock()
      const [modal, setModal] = useState(false), [nested, setNested] = useState(false)
      const [draft, setDraft] = useState('0')
      return <><div id="background"><button onClick={() => setModal(true)}>Modal öffnen</button><FilterDropdown trigger="Import" title="Import"><div id="flyout-content" style={{ height: 1300 }}>Import-Inhalt</div></FilterDropdown><div style={{ height: 1800 }}>Hintergrund</div></div>
      {modal && <div className="modal-overlay"><div id="modal-scroll"><InvoiceAnalysisInfo message="KI-Auswertung übernommen" warning={true} warnings={Array.from({ length: 30 }, (_, index) => 'Prüfhinweis ' + (index + 1))} /><button onClick={() => setModal(false)}>Modal schließen</button><button onClick={() => setNested(true)}>Verschachtelt öffnen</button><SelectDropdown compact ariaLabel="Buchungsreiter wechseln" style={{width:180}} value={draft} onChange={setDraft} options={Array.from({length:20}, (_, i) => ({value:String(i),label:'Bastelmaterial Ferienprogramm · dm-drogerie markt · 07 Aug 2026 · ' + i}))} /><div style={{ height: 1500 }}>Modal-Inhalt</div></div></div>}
      {nested && <div className="modal-overlay nested"><div id="nested-scroll"><button onClick={() => setNested(false)}>Verschachtelt schließen</button><div style={{ height: 800 }}>Innerer Inhalt</div></div></div>}</>
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setContent(`<style>
    ${scrollLockCss}
    #background { height:600px; overflow:auto; width:100%; }
    .modal-overlay { position:fixed; inset:0; z-index:100; background:#0002; display:grid; place-items:center; }
    #modal-scroll { width:400px; height:300px; overflow:auto; background:white; }
    .nested { z-index:200; }
    .invoice-analysis-popover { position:fixed; z-index:30000; width:300px; max-height:220px; overflow:auto; background:white; overscroll-behavior:contain; }
    #nested-scroll { width:240px; height:200px; overflow:auto; background:white; }
    .filter-dropdown__panel { display:flex; flex-direction:column; background:white; }
    .filter-dropdown__content { max-height:300px; overflow:auto; }
  </style><div id="root"></div>`)
  await page.addScriptTag({ content: script })
})

test('flyout blocks background wheel and keyboard scrolling; closing restores it', async ({ page }) => {
  await page.getByRole('button', { name: 'Import' }).click()
  const background = page.locator('#background')
  await expect(background).toHaveClass(/overlay-scroll-locked/)
  await page.mouse.move(1100, 500)
  await page.mouse.wheel(0, 400)
  await page.keyboard.press('PageDown')
  expect(await background.evaluate(el => el.scrollTop)).toBe(0)
  await page.locator('#flyout-content').hover({ position: { x: 20, y: 30 } })
  await page.mouse.wheel(0, 200)
  await expect.poll(() => page.locator('.filter-dropdown__content').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(background).not.toHaveClass(/overlay-scroll-locked/)
  await page.mouse.move(1100, 500)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => background.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
})

test('compact draft menu scrolls by wheel without moving the form or background', async ({ page }, testInfo) => {
  await page.addStyleTag({ content: dropdownCss })
  await page.getByRole('button', { name: 'Modal öffnen' }).click()
  await page.getByRole('button', { name: 'Buchungsreiter wechseln' }).click()
  const menu = page.getByRole('listbox', { name: 'Buchungsreiter wechseln' })
  const parent = page.locator('#modal-scroll')
  await expect(parent).toHaveClass(/overlay-scroll-locked/)
  expect((await menu.getByRole('option').first().boundingBox())!.height).toBeLessThan(54)
  await expect(menu.locator('small')).toHaveCount(0)
  await menu.hover()
  await page.mouse.wheel(0, 220)
  await expect.poll(() => menu.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await parent.evaluate(el => el.scrollTop)).toBe(0)
  expect(await page.locator('#background').evaluate(el => el.scrollTop)).toBe(0)
  await menu.evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.mouse.wheel(0, 300)
  expect(await parent.evaluate(el => el.scrollTop)).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('compact-draft-menu.png') })
  await menu.getByRole('option').last().click()
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buchungsreiter wechseln' })).toContainText('19')
  await expect(parent).not.toHaveClass(/overlay-scroll-locked/)
  await parent.hover()
  await page.mouse.wheel(0, 180)
  await expect.poll(() => parent.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
})

test('nested modal keeps the page and parent locked, including scroll boundaries', async ({ page }) => {
  await page.getByRole('button', { name: 'Modal öffnen' }).click()
  await page.getByRole('button', { name: 'Verschachtelt öffnen' }).click()
  await expect(page.locator('#modal-scroll')).toHaveClass(/overlay-scroll-locked/)
  await page.locator('#nested-scroll').evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.locator('#nested-scroll').hover()
  await page.mouse.wheel(0, 800)
  expect(await page.locator('#modal-scroll').evaluate(el => el.scrollTop)).toBe(0)
  expect(await page.locator('#background').evaluate(el => el.scrollTop)).toBe(0)
  await page.locator('#nested-scroll').evaluate(el => { el.scrollTop = 0 })
  await page.getByRole('button', { name: 'Verschachtelt schließen' }).click()
  await expect(page.locator('#background')).toHaveClass(/overlay-scroll-locked/)
  await expect(page.locator('#modal-scroll')).not.toHaveClass(/overlay-scroll-locked/)
  await page.getByRole('button', { name: 'Modal schließen' }).click()
  await expect(page.locator('.overlay-scroll-locked')).toHaveCount(0)
})


test('opening and closing overlays retains scrollbar space without moving centered content', async ({ page }) => {
  // Force a classic scrollbar so this also catches shifts on headless platforms.
  await page.addStyleTag({ content: `
    #background, #modal-scroll { scrollbar-width:auto; }
    #background::-webkit-scrollbar, #modal-scroll::-webkit-scrollbar { width:16px; }
    #background > button { display:block; width:200px; margin:auto; }
  ` })
  const measure = () => page.locator('#background').evaluate(el => ({
    width: el.clientWidth,
    buttonX: el.querySelector('button')!.getBoundingClientRect().x,
    gutter: (el as HTMLElement).offsetWidth - el.clientWidth
  }))
  const before = await measure()
  expect(before.gutter).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Modal öffnen' }).click()
  await expect(page.locator('#background')).toHaveClass(/overlay-scroll-gutter/)
  expect(await measure()).toEqual(before)
  const modalWidth = await page.locator('#modal-scroll').evaluate(el => el.clientWidth)
  await page.getByRole('button', { name: 'Verschachtelt öffnen' }).click()
  await expect(page.locator('#modal-scroll')).toHaveClass(/overlay-scroll-gutter/)
  expect(await measure()).toEqual(before)
  expect(await page.locator('#modal-scroll').evaluate(el => el.clientWidth)).toBe(modalWidth)
  await page.getByRole('button', { name: 'Verschachtelt schließen' }).click()
  await page.getByRole('button', { name: 'Modal schließen' }).click()
  await expect(page.locator('.overlay-scroll-locked, .overlay-scroll-gutter')).toHaveCount(0)
  expect(await measure()).toEqual(before)
})

test('containers without a scrollbar do not gain a gutter while locked', async ({ page }) => {
  await page.addStyleTag({ content: '#background { height:2400px; } html { overflow:hidden; }' })
  const width = await page.locator('#background').evaluate(el => el.clientWidth)
  await page.getByRole('button', { name: 'Modal öffnen' }).click()
  await expect(page.locator('#background')).toHaveClass(/overlay-scroll-locked/)
  await expect(page.locator('#background')).not.toHaveClass(/overlay-scroll-gutter/)
  expect(await page.locator('#background').evaluate(el => el.clientWidth)).toBe(width)
})

test('viewport scrollbar space is preserved without double compensation on the body', async ({ page }) => {
  await page.addStyleTag({ content: `
    html { overflow-y:auto; scrollbar-width:auto; }
    html::-webkit-scrollbar { width:16px; }
    #background { height:2400px; }
    #background > button { display:block; width:200px; margin:auto; }
  ` })
  const button = page.getByRole('button', { name: 'Modal öffnen' })
  const before = await button.boundingBox()
  expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0)
  await button.click()
  await expect(page.locator('html')).toHaveClass(/overlay-scroll-gutter/)
  await expect(page.locator('body')).not.toHaveClass(/overlay-scroll-gutter/)
  expect(await button.boundingBox()).toEqual(before)
  await page.getByRole('button', { name: 'Modal schließen' }).click()
  await expect(page.locator('html')).not.toHaveClass(/overlay-scroll-gutter/)
  expect(await button.boundingBox()).toEqual(before)
})


test('invoice analysis supports mouse wheel scrolling and restores the parent after closing', async ({ page }) => {
  await page.getByRole('button', { name: 'Modal öffnen' }).click()
  await page.getByRole('button', { name: 'Auswertung mit Prüfhinweisen anzeigen' }).click()
  const panel = page.locator('.invoice-analysis-popover')
  const parent = page.locator('#modal-scroll')
  await expect(parent).toHaveClass(/overlay-scroll-locked/)
  await panel.hover()
  await page.mouse.wheel(0, 180)
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await parent.evaluate(el => el.scrollTop)).toBe(0)
  await panel.evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.mouse.wheel(0, 300)
  expect(await parent.evaluate(el => el.scrollTop)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(parent).not.toHaveClass(/overlay-scroll-locked/)
  await parent.hover()
  await page.mouse.wheel(0, 180)
  await expect.poll(() => parent.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
})
