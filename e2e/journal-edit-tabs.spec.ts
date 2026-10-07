import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let css: string

test.beforeAll(async () => {
  css = await readFile('src/renderer/styles.css', 'utf8')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import JournalView from './src/renderer/views/Journal/JournalView'
      const rows = [1, 2].map(id => ({ id, voucherNo: 'V' + id, date: '2026-10-07',
        type: 'OUT', sphere: 'IDEELL', description: 'Buchung ' + id, amountMode: 'GROSS',
        grossAmount: 15.84, netAmount: 15.84, vatAmount: 0, vatRate: 0,
        paymentMethod: 'BANK', paymentAccountId: 1, tags: [], budgets: [], earmarksAssigned: [] }))
      window.saved = []
      window.failSave = false
      window.api = {
        vouchers: {
          list: async filter => ({ rows: rows.filter(row => !filter.voucherIds || filter.voucherIds.includes(row.id)), total: rows.length }),
          update: async payload => {
            if (window.failSave) throw new Error('Speichern fehlgeschlagen')
            window.saved.push(payload)
            Object.assign(rows.find(row => row.id === payload.id), payload)
            return { id: payload.id }
          }
        },
        attachments: { list: async () => ({ files: [] }) },
        quickAdd: { onSaved: () => () => {} }
      }
      const noop = () => {}
      const notify = (type, message) => { document.getElementById('notifications').textContent = message }
      createRoot(document.getElementById('root')).render(<React.StrictMode><JournalView
        flashId={null} setFlashId={noop} periodLock={null} refreshKey={0} notify={notify}
        bumpDataVersion={noop} fmtDate={d => d} setActivePage={noop} yearsAvail={[2026]}
        budgets={[]} earmarks={[]} paymentAccounts={[{ id: 1, name: 'Bank', kind: 'BANK', sortOrder: 1, isActive: 1 }]}
        tagDefs={[]} budgetsForEdit={[]} budgetNames={new Map()}
        eurFmt={new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })}
        friendlyError={e => e.message} journalLimit={50} setJournalLimit={noop} dateFmt="ISO"
        cols={{date:true,description:true,gross:true,actions:true}} setCols={noop}
        order={['date','description','gross','actions']} setOrder={noop}
        showBookingEditTabs allowVoucherDeletion bookingsOpenDetached={false}
      /></React.StrictMode>)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'unrelated-widgets', setup(builder) {
      builder.onResolve({ filter: /\/(JournalTable|FilterTotals|VoucherInfoModal|AttachmentsModal|TagsEditor|PartySelector|dropdowns)$/ }, args => ({ path: args.path, namespace: 'stub' }))
      builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
        contents: args.path.endsWith('/JournalTable')
          ? `import React from 'react'; export default function Table({rows,onEdit}) { return <div>{rows.map(row => <button key={row.id} onClick={() => onEdit(row)}>Bearbeiten {row.id}</button>)}</div> }`
          : 'export default function Widget() { return null }; export const BatchAssignDropdown = Widget, FilterDropdown = Widget, MetaFilterDropdown = Widget, TimeFilterDropdown = Widget',
        loader: 'tsx', resolveDir: process.cwd()
      }))
    }}]
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1100 })
  await page.route('http://journal.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="notifications" role="status"></div><div id="root"></div>' }))
  await page.goto('http://journal.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await expect(page.getByRole('button', { name: 'Bearbeiten 1', exact: true })).toBeVisible()
})

const tabs = (page: Page) => page.locator('.booking-draft-tab--edit')
const description = (page: Page) => page.locator('.journal-edit-modal__form input[placeholder^="z. B."]')
const closeEditor = (page: Page) => page.locator('.journal-edit-modal__header button[title="Schließen (ESC)"]').click()

test('saving removes the edit tab and reopening uses the saved values', async ({ page }) => {
  await page.getByRole('button', { name: 'Bearbeiten 1', exact: true }).click()
  await description(page).fill('Gespeicherte Beschreibung')
  await page.getByRole('button', { name: 'Speichern (Ctrl+S)', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Buchung gespeichert')
  await expect(page.locator('.journal-edit-modal')).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).saved)).toHaveLength(1)
  await page.getByRole('button', { name: 'Bearbeiten 1', exact: true }).click()
  await expect(description(page)).toHaveValue('Gespeicherte Beschreibung')
  await closeEditor(page)
  await tabs(page).locator('.booking-draft-tab__close').click()
  await expect(tabs(page)).toHaveCount(0)
  await expect(page.getByText('Ungespeicherte Änderungen', { exact: true })).toHaveCount(0)
})

test('discarding removes only the requested tab while parked edits stay available', async ({ page }) => {
  await page.getByRole('button', { name: 'Bearbeiten 1', exact: true }).click()
  await description(page).fill('Entwurf eins')
  await closeEditor(page)
  await expect(tabs(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Bearbeiten 2', exact: true }).click()
  await description(page).fill('Entwurf zwei')
  await closeEditor(page)
  await tabs(page).filter({ hasText: 'Entwurf eins' }).locator('.booking-draft-tab__close').click()
  await page.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click()
  await expect(description(page)).toHaveValue('Entwurf eins')
  await closeEditor(page)
  await tabs(page).filter({ hasText: 'Entwurf eins' }).locator('.booking-draft-tab__close').click()
  await page.getByRole('button', { name: 'Änderungen verwerfen', exact: true }).click()
  await expect(page.locator('.journal-edit-modal')).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(1)
  await tabs(page).locator('.booking-draft-tab__open').click()
  await expect(description(page)).toHaveValue('Entwurf zwei')
  await page.keyboard.press('Control+s')
  await expect(tabs(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Bearbeiten 1', exact: true }).click()
  await expect(description(page)).toHaveValue('Buchung 1')
})

test('a failed save keeps the changes and the tab until explicitly discarded', async ({ page }) => {
  await page.getByRole('button', { name: 'Bearbeiten 1', exact: true }).click()
  await description(page).fill('Nicht gespeichert')
  await page.evaluate(() => { (window as any).failSave = true })
  await page.getByRole('button', { name: 'Speichern (Ctrl+S)', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Speichern fehlgeschlagen')
  await expect(description(page)).toHaveValue('Nicht gespeichert')
  await expect(tabs(page)).toHaveCount(1)
  await closeEditor(page)
  await tabs(page).locator('.booking-draft-tab__close').click()
  await page.getByRole('button', { name: 'Änderungen verwerfen', exact: true }).click()
  await expect(tabs(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).saved)).toHaveLength(0)
})
