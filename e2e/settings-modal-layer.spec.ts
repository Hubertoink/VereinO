import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let styles: string

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import { PaymentAccountsPane } from './src/renderer/views/Settings/panes/PaymentAccountsPane'
      import CashCheckModal from './src/renderer/components/modals/CashCheckModal'
      import CashCheckAuditorsModal from './src/renderer/components/modals/CashCheckAuditorsModal'
      const accounts = [{ id: 1, name: 'Testkasse', kind: 'CASH', sortOrder: 1, isActive: 1 }]
      window.api = {
        paymentAccounts: { list: async () => ({ rows: accounts }) },
        budgets: { list: async () => ({ rows: [] }) },
        reports: { cashBalance: async () => ({ BAR: 123 }) }
      }
      const noop = () => {}
      function Harness() {
        const [rows, setRows] = useState(accounts)
        const [cash, setCash] = useState(false)
        const [auditors, setAuditors] = useState(false)
        return <section className="card settings-content" style={{ margin: '180px 60px', height: 160, overflow: 'hidden' }}>
          <PaymentAccountsPane paymentAccounts={rows} setPaymentAccounts={setRows} notify={noop} bumpDataVersion={noop} />
          <button onClick={() => setCash(true)}>Kassenprüfung öffnen</button>
          <button onClick={() => setAuditors(true)}>Prüfer öffnen</button>
          <CashCheckModal open={cash} year={new Date().getFullYear()} notify={noop} onClose={() => setCash(false)} />
          <CashCheckAuditorsModal open={auditors} notify={noop} onConfirm={noop} onClose={() => setAuditors(false)} />
        </section>
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    ` }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
  styles = await readFile('src/renderer/styles.css', 'utf8')
})

for (const glass of [false, true]) {
  test(`settings dialogs escape clipped cards with glass=${glass}`, async ({ page }) => {
    await page.route('http://settings.test/', route => route.fulfill({ contentType: 'text/html', body: `<html data-glass-modals="${glass}"><body><div id="root"></div></body></html>` }))
    await page.goto('http://settings.test/')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addStyleTag({ content: styles + ':root { --blur: blur(12px); --surface: #171e1a; --bg: #111713; --text: #eeecea; --border: #344038; --accent: #edb1bd; }' })
    await page.addScriptTag({ content: script })

    async function checkOverlay(title: string) {
      const dialog = page.getByRole('dialog').last()
      await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect.poll(() => dialog.evaluate(el => {
        const rect = el.getBoundingClientRect()
        return el.parentElement === document.body && rect.x === 0 && rect.y === 0 && rect.width === innerWidth && rect.height === innerHeight
      })).toBe(true)
      const heading = dialog.getByRole('heading', { name: title, exact: true })
      await expect.poll(() => heading.evaluate(el => {
        const r = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
      })).toBe(true)
      return dialog
    }

    await page.getByRole('button', { name: '+ Neues Konto', exact: true }).click()
    let dialog = await checkOverlay('Konto anlegen')
    await dialog.getByRole('button', { name: 'Eigene…', exact: true }).click()
    const color = await checkOverlay('Eigene Farbe wählen')
    await color.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await page.getByRole('button', { name: 'Testkasse bearbeiten', exact: true }).click()
    dialog = await checkOverlay('Konto bearbeiten')
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await page.getByTitle('Löschen', { exact: true }).click()
    dialog = await checkOverlay('Konto löschen')
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await page.getByRole('button', { name: 'Kassenprüfung öffnen', exact: true }).click()
    dialog = await checkOverlay('Neue Kassenprüfung')
    await expect(dialog).toContainText('123,00')
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await page.getByRole('button', { name: 'Prüfer öffnen', exact: true }).click()
    dialog = await checkOverlay('Kassenprüfer eintragen')
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}
