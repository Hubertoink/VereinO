import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/views/BankImport/bankImportPage.css', 'src/renderer/views/BankImport/bankReview.css', 'src/renderer/views/BankImport/bankAiReviewProgress.css'].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import BankImportView from './src/renderer/views/BankImport/BankImportView'
    import { ToastProvider } from './src/renderer/context/ToastContext'
    import { useToast } from './src/renderer/context/useToast'
    const root = createRoot(document.getElementById('root'))
    const account = { id: 1, name: 'Bank', kind: 'BANK', isActive: 1 }
    const suggestion = id => ({ transactionId: id, action: 'CREATE_BOOKING', confidence: .9, reason: 'Passende Kategorie.', warnings: [], evidence: [] })
    window.renderReview = (reviewed = 7) => {
      window.calls = []; window.unsubscribed = 0
      let callback
      const rows = Array.from({length: 7}, (_, i) => ({ id: i+1, bookingDate: '2026-08-13', direction: 'OUT', amount: 29.99 + i,
        currency: 'EUR', purpose: 'Monatsbeitrag August', counterparty: ['Canva Pty Ltd', 'REWE Markt GmbH', 'Raummiete', 'Musikhaus', 'Stadt Höchstädt', 'Lea Schneider', 'EDEKA'][i],
        status: 'OPEN', paymentAccountId: 1, paymentAccountName: 'Bank', aiSuggestion: i < reviewed ? suggestion(i+1) : null }))
      window.api = {
        bankTransactions: { list: async () => ({ rows: [...rows], total: 7, stats: { total: 7, open: 7, linked: 0, checked: 0 } }),
          importStatus: async () => ({ total: 7, lastBookingDate: null, accounts: [], recentImports: [] }) },
        ai: { bankImports: {
          onReviewProgress: cb => { callback = cb; return () => { window.unsubscribed++; callback = null } },
          reviewOpen: payload => { window.calls.push(payload); return new Promise((resolve, reject) => {
            window.finish = () => { for (const id of payload.transactionIds) rows[id-1].aiSuggestion = suggestion(id); resolve({ suggestions: payload.transactionIds.map(suggestion), warnings: [] }) }
            window.fail = () => reject(new Error('Provider nicht erreichbar'))
          }) }
        } }
      }
      window.emit = (activeIds, completedIds, phase = 'analyzing', requestId) => { const call = window.calls.at(-1); callback?.({ requestId: requestId || call.requestId, transactionIds: call.transactionIds, activeIds, completedIds, phase }) }
      function Harness() { const { notify } = useToast(); return <BankImportView paymentAccounts={[account]} notify={notify} onCreateBooking={() => {}} onOpenVoucher={() => {}} /> }
      root.render(<ToastProvider><Harness /></ToastProvider>)
      window.unmount = () => root.unmount()
    }
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.route('https://review.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><main class="app-main"><div id="root"></div></main></html>' }))
  await page.goto('https://review.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('confirms rechecks, shows persistent toast with real progress, and removes it on completion', async ({ page }, info) => {
  await page.evaluate(() => (window as any).renderReview())
  const start = page.getByRole('button', { name: 'Sichtbare offene Bankbelege mit KI prüfen' })
  await start.click()
  await expect(page.getByRole('dialog', { name: 'Erneut mit KI prüfen?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  expect(await page.evaluate(() => (window as any).calls)).toEqual([])
  await start.click()
  await page.getByRole('button', { name: 'Erneut prüfen', exact: true }).click()
  await expect(start).toBeDisabled()
  await page.evaluate(() => (window as any).emit([1, 2, 3, 4, 5], []))
  await expect(page.locator('.bank-ai-row-active')).toHaveCount(5)
  await expect(page.locator('.bank-ai-row-active').first()).toHaveCSS('animation-name', 'bank-ai-review-sweep')
  await expect(page.locator('.bank-ai-row-active').first()).toHaveCSS('background-image', /linear-gradient/)
  for (const cell of await page.locator('.bank-ai-row-active').first().locator('td').all()) {
    await expect(cell).toHaveCSS('background-image', 'none')
    await expect(cell).toHaveCSS('animation-name', 'none')
  }
  const toast = page.locator('.toast-progress')
  await expect(toast).toContainText('KI-Prüfung läuft · 0 von 7')
  await expect(page.locator('.toast-spinner')).toHaveCSS('animation-name', 'toastSpin')
  await expect(page.locator('.bank-ai-progress')).toHaveCount(0)
  await expect(toast).toHaveCSS('opacity', '1')
  await page.screenshot({ path: info.outputPath('review-toast.png') })
  await page.clock.install()
  await page.clock.fastForward(15_000)
  await expect(toast).toBeVisible()
  await page.evaluate(() => (window as any).emit([6, 7], [1, 2, 3, 4, 5]))
  await expect(toast).toContainText('5 von 7')
  await expect(page.locator('.bank-ai-row-active')).toHaveCount(2)
  await expect(page.locator('.bank-ai-row-done')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(1)
  await page.evaluate(() => (window as any).finish())
  await expect(toast).toHaveCount(0)
  await expect(start).toBeEnabled()
  await expect(page.locator('.bank-ai-row-done')).toHaveCount(7)
  await expect(page.getByText('KI-Prüfung abgeschlossen', { exact: true })).toHaveCount(0)
})

test('only checks unreviewed rows, ignores unrelated events, and clears loading after errors', async ({ page }) => {
  await page.evaluate(() => (window as any).renderReview(5))
  const start = page.getByRole('button', { name: 'Sichtbare offene Bankbelege mit KI prüfen' })
  await start.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).calls[0].transactionIds)).toEqual([6, 7])
  await page.evaluate(() => (window as any).emit([6, 7], [], 'analyzing', 'unrelated-request'))
  await expect(page.locator('.bank-ai-row-active')).toHaveCount(0)
  await page.evaluate(() => (window as any).emit([6, 7], []))
  await expect(page.locator('.bank-ai-row-active')).toHaveCount(2)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.toast-spinner')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.bank-ai-row-active').first()).toHaveCSS('animation-name', 'none')
  await page.evaluate(() => (window as any).fail())
  await expect(page.locator('.toast-progress')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('Provider nicht erreichbar')
  await expect(start).toBeEnabled()
  await expect(page.locator('.bank-ai-row-done')).toHaveCount(0)
  await start.click()
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(2)
  await expect(page.locator('.toast-progress')).toHaveCount(1)
  await page.evaluate(() => (window as any).unmount())
  expect(await page.evaluate(() => (window as any).unsubscribed)).toBe(1)
  await expect(page.locator('.toast-progress')).toHaveCount(0)
})
