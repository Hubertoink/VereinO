import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
let script: string
let styles: string

test.beforeAll(async () => {
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import SetupWizardModal from './src/renderer/components/modals/SetupWizardModal'
    window.writes = []; window.preferences = []; window.tagsSaved = []; window.folderChanges = []
    window.failKey = ''; window.failLoad = false; window.cancelPicker = false
    const settings = { 'org.name': 'Testverein', 'org.cashier': 'Alex', 'backup.auto': 'OFF', 'backup.intervalDays': 14 }
    window.api = {
      settings: { get: async ({key}) => { if (window.failLoad) throw new Error('Laden fehlgeschlagen'); return { value: settings[key] } }, set: async value => { if (value.key === window.failKey) throw new Error('Speichern fehlgeschlagen'); window.writes.push(value); settings[value.key] = value.value; return { ok: true } } },
      organizations: { active: async () => ({ organization: { id: 'org1', name: 'Testverein', profile: window.profile || 'NONPROFIT' } }), setAppearance: async value => { window.preferences.push(value); return { success: true } } },
      backup: { getDir: async () => ({ ok: true, dir: 'C:\\\\Backups' }), pickDir: async () => window.cancelPicker ? ({ ok: false, canceled: true }) : ({ ok: true, dir: 'D:\\\\VereinO' }), setDir: async ({dir}) => { window.folderChanges.push(dir); return { ok: true, dir, moved: 0 } } },
      tags: { list: async () => ({ rows: [{ name: 'Material' }, ...window.tagsSaved] }), upsert: async value => { window.tagsSaved.push(value); return { id: 1 } } }
    }
    localStorage.setItem('journalCols', 'existing-columns'); localStorage.setItem('journalColsOrder', 'existing-order'); localStorage.setItem('ui.quickAddAfterSave', 'new')
    function Harness() {
      const [open, setOpen] = useState(true)
      const [view, setView] = useState('plus')
      const [theme, setTheme] = useState('earthy-tones')
      return <><button onClick={() => setOpen(true)}>Setup öffnen</button><div data-testid="active-view">{view}</div><div data-testid="active-theme">{theme}</div>{open && <SetupWizardModal bookingView={view} setBookingView={setView} colorTheme={theme} setColorTheme={setTheme} existingTags={[{ name: 'Material' }]} onClose={() => setOpen(false)} notify={() => {}} />}</>
    }
    createRoot(document.getElementById('root')).render(<Harness />)
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty', '.ico': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
  styles = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/components/modals/setupBookingView.css', 'src/renderer/components/modals/setupWizard.css'].map(path => readFile(path, 'utf8')))).join('\n')
})

test.beforeEach(async ({ page }) => {
  await page.route('http://setup.test/', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark" data-color-theme="earthy-tones"><body><div id="root"></div></body></html>' }))
  await page.goto('http://setup.test/')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await expect(page.getByLabel(/Name der Organisation/)).toHaveValue('Testverein')
})

for (const view of ['plus', 'classic'] as const) {
  test(`four-step setup applies ${view} only at completion and preserves workflow and columns`, async ({ page }) => {
    await page.getByLabel(/Name der Organisation/).fill('Neuer Vereinsname')
    await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await page.getByRole('radio', { name: view === 'plus' ? 'Buchungen Plus' : 'Buchungen klassisch' }).check()
    await page.getByText('Farbschema anpassen').click()
    await page.getByRole('button', { name: 'Ocean Breeze', exact: true }).click()
    await expect(page.getByTestId('active-theme')).toHaveText('earthy-tones')
    await expect(page.getByTestId('active-view')).toHaveText('plus')
    await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await expect(page.getByRole('radio', { name: /Manuell sichern/ })).toBeChecked()
    await page.getByRole('radio', { name: /Automatisch sichern/ }).check()
    await page.getByLabel('Intervall', { exact: true }).selectOption('7')
    await page.getByRole('button', { name: 'Ordner wählen…' }).click()
    await expect(page.getByLabel('Sicherungsordner', { exact: true })).toHaveValue('D:\\VereinO')
    await expect.poll(() => page.evaluate(() => (window as any).folderChanges.length)).toBe(0)
    await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await expect(page.locator('.setup-review')).toContainText('Neuer Vereinsname')
    await expect.poll(() => page.evaluate(() => (window as any).writes.length)).toBe(0)
    await page.getByText('Starter-Tags hinzufügen').click()
    await expect(page.getByRole('checkbox', { name: /Material/ })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: /Material/ })).toBeDisabled()
    await page.getByRole('checkbox', { name: 'Spende', exact: true }).check()
    await page.getByLabel('Eigener Tag', { exact: true }).fill('Sommerfest')
    await page.getByLabel('Eigener Tag', { exact: true }).press('Enter')
    await page.getByRole('button', { name: 'VereinO starten', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('active-view')).toHaveText(view)
    await expect(page.getByTestId('active-theme')).toHaveText('ocean-breeze')
    expect(await page.evaluate(() => (window as any).writes)).toEqual([{key:'org.name',value:'Neuer Vereinsname'},{key:'org.cashier',value:'Alex'},{key:'backup.auto',value:'SILENT'},{key:'backup.intervalDays',value:7},{key:'setup.completed',value:true}])
    expect(await page.evaluate(() => (window as any).tagsSaved)).toEqual([{name:'Spende',color:'#1565C0'},{name:'Sommerfest'}])
    expect(await page.evaluate(() => (window as any).preferences)).toEqual([{orgId:'org1',colorTheme:'ocean-breeze',bookingView:view}])
    expect(await page.evaluate(() => [localStorage.getItem('journalCols'),localStorage.getItem('journalColsOrder'),localStorage.getItem('ui.quickAddAfterSave')])).toEqual(['existing-columns','existing-order','new'])
  })
}

test('postponing discards drafts, folder picking is non-mutating and back navigation preserves choices', async ({ page }) => {
  await page.getByLabel(/Name der Organisation/).fill('Unbestätigt')
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await page.getByRole('radio', { name: 'Buchungen klassisch' }).check()
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await page.getByRole('button', { name: 'Ordner wählen…' }).click()
  await page.getByRole('button', { name: 'Zurück', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Buchungen klassisch' })).toBeChecked()
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await expect(page.getByLabel('Sicherungsordner', { exact: true })).toHaveValue('D:\\VereinO')
  await page.getByRole('button', { name: 'Später einrichten', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => [(window as any).writes,(window as any).preferences,(window as any).folderChanges])).toEqual([[],[],[]])
  await page.getByRole('button', { name: 'Setup öffnen' }).click()
  await expect(page.getByLabel(/Name der Organisation/)).toHaveValue('Testverein')
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Buchungen Plus' })).toBeChecked()
})

test('save failure stays open, never marks completion, and supports retry', async ({ page }) => {
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await page.getByText('Starter-Tags hinzufügen').click()
  await page.getByRole('checkbox', { name: 'Spende', exact: true }).check()
  await page.evaluate(() => { (window as any).failKey = 'setup.completed' })
  await page.getByRole('button', { name: 'VereinO starten', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Speichern fehlgeschlagen')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => (window as any).writes.some((entry: any) => entry.key === 'setup.completed'))).toBe(false)
  await page.evaluate(() => { (window as any).failKey = '' })
  await page.getByRole('button', { name: 'VereinO starten', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).tagsSaved)).toEqual([{name:'Spende',color:'#1565C0'}])
})

test('load failure blocks overwriting settings; empty name and canceled picker are handled', async ({ page }) => {
  await page.getByLabel(/Name der Organisation/).fill(' ')
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Namen')
  await page.getByLabel(/Name der Organisation/).fill('Test')
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await page.evaluate(() => { (window as any).cancelPicker = true })
  await page.getByRole('button', { name: 'Ordner wählen…' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Sicherungsordner', { exact: true })).toHaveValue('C:\\Backups')
  await expect(page.getByRole('button', { name: 'Ordner wählen…' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => { (window as any).failLoad = true })
  await page.getByRole('button', { name: 'Setup öffnen' }).click()
  await expect(page.getByRole('alert')).toContainText('Laden fehlgeschlagen')
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled()
  await page.evaluate(() => { (window as any).failLoad = false })
  await page.getByRole('button', { name: 'Erneut laden' }).click()
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled()
})

for (const theme of ['light','dark']) test(`all four steps fit small and large windows in ${theme}`, async ({page}) => {
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.colorTheme = theme === 'light' ? 'professional-light' : 'earthy-tones' },theme)
  for (const width of [1200,390]) {
    await page.setViewportSize({width,height:width === 1200 ? 850 : 650})
    for(let step=0;step<4;step++) {
      const modal=page.locator('.setup-wizard')
      await expect.poll(() => modal.evaluate(el => {const r=el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight+1 && r.right <= innerWidth+1 && el.scrollWidth <= el.clientWidth+1})).toBe(true)
      await expect(page.locator('.setup-wizard-footer')).toBeInViewport()
      await expect(page.getByRole('button', {name: /Später einrichten/})).toBeInViewport()
      if(process.env.CAPTURE_SETUP) { await mkdir('release/design/setup-new',{recursive:true}); await modal.screenshot({path:`release/design/setup-new/${theme}-${width}-${step}.png`}) }
      if(step<3) await page.getByRole('button',{name:'Weiter',exact:true}).click()
    }
    await page.getByRole('button',{name:/Willkommen/}).click()
  }
})


test('theme selection updates both miniatures using the app palette while leaving the app unchanged', async ({page}) => {
  await page.getByRole('button', {name:'Weiter',exact:true}).click()
  await page.getByText('Farbschema anpassen').click()
  const before = await page.locator('.setup-wizard').evaluate(el => ({color:getComputedStyle(el).color, background:getComputedStyle(el).backgroundColor}))
  for (const [name, key, background] of [['Ocean Breeze','ocean-breeze','rgb(9, 11, 22)'],['Professional','professional-light','rgb(244, 243, 241)'],['Standard','default','rgb(15, 17, 21)']]) {
    await page.getByRole('button',{name,exact:true}).click()
    const previews=page.locator('.setup-theme-preview')
    await expect(previews).toHaveCount(2)
    for(const preview of await previews.all()) {
      await expect(preview).toHaveAttribute('data-color-theme',key)
      await expect(preview).toHaveCSS('background-color',background)
    }
    expect(await page.locator('.setup-wizard').evaluate(el => ({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}))).toEqual(before)
    await expect(page.locator('html')).toHaveAttribute('data-color-theme','earthy-tones')
    await expect(page.getByTestId('active-theme')).toHaveText('earthy-tones')
    expect(await page.evaluate(() => (window as any).preferences)).toEqual([])
    if(process.env.CAPTURE_SETUP) await page.locator('.setup-wizard').screenshot({path:`release/design/setup-new/preview-${key}.png`})
  }
})
