import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, mkdir } from 'node:fs/promises'
let script: string
let styles: string

test.beforeAll(async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { PaymentAccountsPane } from './src/renderer/views/Settings/panes/PaymentAccountsPane'
    import TagModal from './src/renderer/components/modals/TagModal'
    import CategoryModal from './src/renderer/components/modals/CategoryModal'
    import BudgetModal from './src/renderer/components/modals/BudgetModal'
    import BindingModal from './src/renderer/components/modals/BindingModal'
    import { PartyEditorModal } from './src/renderer/components/common/PartySelector'
    import NewOrgModal from './src/renderer/components/modals/NewOrgModal'
    window.saved = []
    const save = async value => { window.saved.push(value); return { id: 1 } }
    window.api = {
      paymentAccounts: { list: async () => ({ rows: [] }), upsert: save },
      tags: { upsert: save }, classifications: { primary: { create: save, update: save } },
      budgets: { upsert: save }, bindings: { upsert: save },
      parties: { upsert: save, get: async () => ({ id: 1, name: 'Test' }) },
      organizations: { create: async value => { await save(value); return { organization: { id: 'new', name: value.name } } } }
    }
    const noop = () => {}
    function Harness() {
      const [rows, setRows] = useState([])
      const [modal, setModal] = useState('')
      const close = () => setModal('')
      return <>
        <PaymentAccountsPane paymentAccounts={rows} setPaymentAccounts={setRows} notify={noop} bumpDataVersion={noop} />
        {['Tag', 'Kategorie', 'Budget', 'Zweckbindung', 'Geschäftspartner', 'Organisation'].map(name => <button key={name} onClick={() => setModal(name)}>{name}</button>)}
        {modal === 'Tag' && <TagModal value={{ name: '' }} onClose={close} onSaved={close} />}
        {modal === 'Kategorie' && <CategoryModal value={{ name: '' }} onClose={close} onSaved={close} notify={noop} />}
        {modal === 'Budget' && <BudgetModal value={{ name: '', year: 2026, sphere: 'IDEELL', amountPlanned: 0 }} onClose={close} onSaved={close} />}
        {modal === 'Zweckbindung' && <BindingModal value={{ code: '', name: '' }} onClose={close} onSaved={close} />}
        {modal === 'Geschäftspartner' && <PartyEditorModal onClose={close} onSaved={close} />}
        {modal === 'Organisation' && <NewOrgModal onClose={close} onCreated={close} />}
      </>
    }
    createRoot(document.getElementById('root')).render(<Harness />)
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = bundle.outputFiles[0].text
  styles = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/common/party.css', 'src/renderer/components/modalHeader.css'].map(file => readFile(file, 'utf8')))).join('\n')
})

test.beforeEach(async ({ page }) => {
  await page.route('http://dialogs.test/', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark" data-color-theme="earthy-tones"><body><div id="root"></div></body></html>' }))
  await page.goto('http://dialogs.test/')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
})

test('account saves all fields, nested colors preserve the parent and keyboard focus', async ({ page }) => {
  await page.getByRole('button', { name: '+ Neues Konto' }).click()
  const dialog = page.getByRole('dialog', { name: 'Konto anlegen' })
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused()
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Hauptkonto')
  await dialog.getByLabel('IBAN', { exact: true }).fill('DE123456')
  await dialog.getByLabel('Reihenfolge').fill('3')
  await dialog.getByRole('button', { name: 'Eigene…', exact: true }).click()
  const color = page.getByRole('dialog', { name: 'Eigene Farbe wählen' })
  await color.getByLabel('HEX', { exact: true }).fill('ungültig')
  await color.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(color.getByRole('alert')).toBeVisible()
  await color.getByLabel('HEX', { exact: true }).fill('#123456')
  await color.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(dialog.locator('.dialog-color-current')).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await expect(dialog.getByRole('button', { name: /Eigene…/ })).toBeFocused()
  await dialog.getByRole('button', { name: /Eigene…/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Zufällige Farbe erzeugen' }).click()
  await expect(dialog.locator('.dialog-color-current')).toBeVisible()
  await dialog.getByRole('button', { name: 'Farbe #00C853', exact: true }).click()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).saved)).toEqual([{ name: 'Hauptkonto', kind: 'BANK', iban: 'DE123456', color: '#00C853', sortOrder: 3, isActive: true }])
})

test('tag and category save names, colors and symbols', async ({ page }) => {
  for (const type of ['Tag', 'Kategorie']) {
    await page.getByRole('button', { name: type, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(' Getränke ')
    await dialog.getByRole('button', { name: 'Farbe #2962FF', exact: true }).click()
    if (type === 'Kategorie') await dialog.getByRole('button', { name: 'Symbol: Verpflegung', exact: true }).click()
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await expect.poll(() => page.evaluate(() => (window as any).saved)).toEqual([{ name: 'Getränke', color: '#2962FF' }, { name: 'Getränke', color: '#2962FF', icon: 'coffee' }])
})

for (const theme of ['dark', 'light']) {
  test(`all master data dialogs fit desktop and narrow windows (${theme})`, async ({ page }) => {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.colorTheme = theme === 'dark' ? 'earthy-tones' : 'professional-light' }, theme)
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: width === 1000 ? 850 : 650 })
      for (const type of ['+ Neues Konto', 'Tag', 'Kategorie', 'Budget', 'Zweckbindung', 'Geschäftspartner', 'Organisation']) {
        await page.getByRole('button', { name: type, exact: true }).click()
        const dialog = page.getByRole('dialog').last()
        await expect(dialog).toBeVisible()
        const panel = dialog.locator('.modal').first()
        await expect(panel).toBeVisible()
        await expect.poll(() => panel.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1 })).toBe(true)
        // Every label stays above its field; the footer remains reachable.
        const save = dialog.getByRole('button', { name: /^(Speichern|Erstellen)$/ })
        await save.scrollIntoViewIfNeeded()
        await expect(save).toBeInViewport()
        if (process.env.CAPTURE_DIALOGS) {
          await mkdir('release/design', { recursive: true })
          await panel.screenshot({ path: `release/design/modal-${type.replace(/[^a-zA-Z]/g, '')}-${theme}-${width}.png` })
        }
        await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
    }
  })
}
