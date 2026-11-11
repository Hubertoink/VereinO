import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'

let script: string

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx', contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { AIPatternsPane } from './src/renderer/views/Settings/panes/AIPatternsPane'
        import { initializeBookingAIPatterns, rememberBookingAIPattern } from './src/renderer/utils/bookingAiPatterns'
        const id = new URLSearchParams(location.search).get('org') || 'a'
        let switched = () => {}
        window.api = {
          organizations: {
            active: async () => ({ organization: { id } }),
            onSwitched: callback => { switched = callback; return () => {} },
          },
          budgets: { list: async () => ({ rows: [{ id: 1, name: 'Budget ' + id }] }) },
          bindings: { list: async () => ({ rows: [] }) },
        }
        function Fixture() {
          return <>
            <button onClick={() => rememberBookingAIPattern({
              description: 'Snacks', grossAmount: 12, type: 'OUT', tags: ['Verein ' + id],
              paymentAccountId: 3, budgets: [{ budgetId: 1, amount: 12 }],
            })}>Buchung lernen</button>
            <button onClick={() => { switched(); location.href = '/?org=' + (id === 'a' ? 'b' : 'a') }}>Organisation wechseln</button>
            <AIPatternsPane tagDefs={[]} paymentAccounts={[{id:3,name:'Konto ' + id,kind:'BANK'}]} notify={() => {}} />
          </>
        }
        initializeBookingAIPatterns().then(() => createRoot(document.getElementById('root')).render(<Fixture />))
      `,
    },
    bundle: true, platform: 'browser', write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ context }) => {
  await context.route('http://booking-ai.test/**', route => route.fulfill(
    route.request().url().endsWith('/fixture.js')
      ? { contentType: 'text/javascript', body: script }
      : { contentType: 'text/html', body: '<html><body><div id="root"></div><script src="/fixture.js"></script></body></html>' }
  ))
})

const learnedRow = (page: Page) => page.getByRole('row').filter({ hasText: 'text:snacks' })

async function learnTwice(page: Page) {
  await page.getByRole('button', { name: 'Buchung lernen' }).click({ clickCount: 2 })
  await expect(learnedRow(page)).toBeVisible()
}

test('keeps patterns and settings isolated after switching organizations and reloading', async ({ page }) => {
  await page.goto('http://booking-ai.test/?org=a')
  await learnTwice(page)
  await expect(learnedRow(page)).toContainText('Verein a')
  await expect(learnedRow(page)).toContainText('Budget a')
  await learnedRow(page).getByRole('checkbox').uncheck()
  await page.getByRole('switch', { name: 'Mustererkennung' }).uncheck()

  await page.getByRole('button', { name: 'Organisation wechseln' }).click()
  await expect(page.getByRole('switch', { name: 'Mustererkennung' })).toBeChecked()
  await expect(learnedRow(page)).toHaveCount(0)
  await learnTwice(page)
  await expect(learnedRow(page)).toContainText('Verein b')
  await expect(learnedRow(page)).toContainText('Budget b')
  await expect(learnedRow(page).getByRole('checkbox')).toBeChecked()

  await page.getByRole('button', { name: 'Organisation wechseln' }).click()
  await expect(page.getByRole('switch', { name: 'Mustererkennung' })).not.toBeChecked()
  await expect(learnedRow(page)).toContainText('Verein a')
  await expect(learnedRow(page)).not.toContainText('Verein b')
  await expect(learnedRow(page).getByRole('checkbox')).not.toBeChecked()
})

test('synchronizes same-organization windows through storage events without affecting another organization', async ({ page, context }) => {
  const detached = await context.newPage()
  const other = await context.newPage()
  await page.goto('http://booking-ai.test/?org=a')
  await detached.goto('http://booking-ai.test/?org=a')
  await other.goto('http://booking-ai.test/?org=b')
  await learnTwice(detached)
  await expect(learnedRow(page)).toContainText('Verein a')
  await expect(learnedRow(other)).toHaveCount(0)
  await page.getByRole('switch', { name: 'Mustererkennung' }).uncheck()
  await expect(detached.getByRole('switch', { name: 'Mustererkennung' })).not.toBeChecked()
  await expect(other.getByRole('switch', { name: 'Mustererkennung' })).toBeChecked()
  await page.getByRole('switch', { name: 'Mustererkennung' }).check()
  await learnedRow(detached).getByTitle('Gelerntes Muster entfernen').click()
  await expect(learnedRow(page)).toHaveCount(0)
})
