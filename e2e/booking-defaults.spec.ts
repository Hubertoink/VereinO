import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

let script: string

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { useQuickAdd } from './src/renderer/hooks/useQuickAdd'
      function Harness() {
        const hook = useQuickAdd('2026-09-09', async () => window.failSave ? null : { id: 1 }, undefined, undefined, true)
        return <div>
          <output id="type">{hook.quickAdd ? hook.qa.type : 'closed'}</output>
          <button id="new" onClick={() => hook.openQuickAdd()}>Neu</button>
          <button id="configure" onClick={() => hook.setQa({ ...hook.qa, type: window.nextType, mode: 'GROSS', grossAmount: 350, paymentAccountId: 1, transferFromAccountId: 1, transferToAccountId: 2, budgets: window.nextType === 'INTERNAL' ? [{ budgetId: 1, amount: -350 }, { budgetId: 2, amount: 350 }] : [] })}>Ausfüllen</button>
          <button id="save" onClick={() => hook.onQuickSave()}>Speichern</button>
          <button id="cancel" onClick={hook.parkQuickAdd}>Abbrechen</button>
        </div>
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    ` }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://booking.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://booking.test/')
  await page.evaluate(() => localStorage.setItem('bookingHabits', JSON.stringify({ types: { IN: 100 }, paymentMethods: {}, modes: {} })))
  await page.addScriptTag({ content: script })
})

for (const type of ['IN', 'OUT', 'TRANSFER', 'INTERNAL']) {
  test(`a successful ${type} booking becomes the default, even after remount`, async ({ page }) => {
    await page.locator('#new').click()
    await page.evaluate(value => { (window as any).nextType = value }, type)
    await page.locator('#configure').click()
    await page.locator('#save').click()
    await expect(page.locator('#type')).toHaveText('closed')
    await page.reload()
    await page.addScriptTag({ content: script })
    await page.locator('#new').click()
    await expect(page.locator('#type')).toHaveText(type)
  })
}

test('cancelled and failed bookings do not change the last saved type', async ({ page }) => {
  await page.locator('#new').click()
  await page.evaluate(() => { (window as any).nextType = 'OUT'; (window as any).failSave = true })
  await page.locator('#configure').click()
  await page.locator('#save').click()
  await expect(page.locator('#type')).toHaveText('OUT')
  await page.locator('#cancel').click()
  await page.locator('#new').click()
  await expect(page.locator('#type')).toHaveText('IN')
})
