import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildReportFinance } from '../shared/aiReporting'

test('dashboard report sources open filtered bookings and the app has one vertical scroll area', async ({}, info) => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vereino-report-app-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [path.resolve('dist-electron/main/index.cjs'), `--user-data-dir=${userDataDir}`], env: {
    ...env, ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString(), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 25000 })
    const later = page.getByRole('button', { name: 'Später', exact: true })
    await page.addLocatorHandler(later, () => later.click())
    await page.evaluate(async () => {
      const active = await window.api.organizations.active()
      await window.api.organizations.setAppearance({ orgId: active.organization!.id, bookingView: 'plus', backgroundImage: 'niko-bg', glassModals: true })
      await window.api.ai.settings.set({ apiKey: 'sk-test-report-no-network' })
      const account = await window.api.paymentAccounts.upsert({ name: 'Testbank', kind: 'BANK' })
      await window.api.vouchers.create({ date: '2026-08-17', type: 'OUT', sphere: 'IDEELL', description: 'Report source August', mode: 'GROSS', grossAmount: 119, vatRate: 0, paymentMethod: 'BANK', paymentAccountId: account.id })
      await window.api.vouchers.create({ date: '2026-09-01', type: 'OUT', sphere: 'IDEELL', description: 'Outside report period', mode: 'GROSS', grossAmount: 10, vatRate: 0, paymentMethod: 'BANK', paymentAccountId: account.id })
    })
    const finance = buildReportFinance({ from: '2026-08-01', to: '2026-08-31' }, [], [{ month: '2026-08', gross: -119 }], 0)
    await app.evaluate(({ ipcMain }, finance) => {
      ipcMain.removeHandler('ai.agent.run')
      ipcMain.handle('ai.agent.run', () => ({ sessionId: 'test-session', answer: 'Gebuchte Ausgaben im ausgewählten Zeitraum.', drafts: [], trace: [], toolCalls: [], reports: [{ title: 'Saldo im August', summary: 'Gebuchte Ausgaben im ausgewählten Zeitraum.', notes: [], blocks: [{ type: 'metrics', data: 'finance' }, { type: 'balance', data: 'finance' }], datasets: { finance } }] }))
    }, finance)
    await page.reload()
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true })).toBeEnabled({ timeout: 20000 })
    const main = page.locator('.app-main')
    for (const position of ['top', 'bottom']) {
      await main.evaluate((element, position) => { element.scrollTop = position === 'top' ? 0 : element.scrollHeight }, position)
      const geometry = await page.evaluate(() => ({ documentHeight: document.documentElement.scrollHeight, viewport: window.innerHeight,
        main: document.querySelector('.app-main')!.getBoundingClientRect().toJSON(), root: document.querySelector('.app-root-grid')!.getBoundingClientRect().toJSON() }))
      expect(geometry.documentHeight, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport)
    }
    await page.screenshot({ path: info.outputPath('dashboard-bottom.png') })
    await page.getByLabel('Auswertung von').fill('2026-08-01')
    await page.getByLabel('Auswertung bis').fill('2026-08-31')
    await page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saldo im August' })).toBeVisible()
    await page.getByRole('button', { name: 'Ausgaben ansehen', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Buchungen Plus', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Ab (2026-08-01|01\.08\.2026): Filter entfernen$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Bis (2026-08-31|31\.08\.2026): Filter entfernen$/ })).toBeVisible()
    await expect(page.locator('.bp-row')).toHaveCount(1)
    await expect(page.locator('.bp-row')).toContainText('Report source August')
    await expect(page.getByRole('button', { name: 'Ausgabe: Filter entfernen' })).toBeVisible()

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ai.agent.run')
      ;(globalThis as any).reportTestRuns = 0
      ipcMain.handle('ai.agent.run', () => {
        ;(globalThis as any).reportTestRuns++
        return { sessionId: 'draft-session', answer: 'Der Vorschlag liegt zur Prüfung vor.', trace: [], toolCalls: [], drafts: [
          { kind: 'tagChange', title: 'Tag Sommerfest anlegen', payload: { changes: [{ action: 'CREATE', name: 'Sommerfest', selected: true }] } }
        ] }
      })
    })
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
    await page.getByLabel('Frage zu Reporting oder Controlling').fill('Bereite mir bitte einen Tag Sommerfest vor.')
    await page.getByRole('button', { name: 'Frage senden', exact: true }).click()
    await page.getByRole('button', { name: 'Vorschläge im KI-Bereich prüfen' }).click()
    await expect(page.locator('#ai-review-tag-actions')).toBeVisible({ timeout: 15000 }).catch(async error => {
      await page.screenshot({ path: info.outputPath('handoff.png') })
      console.log(await page.locator('#ai-review-tag-actions').evaluate(element => {
        const ancestors = []
        for (let node: Element | null = element; node; node = node.parentElement) ancestors.push({ tag: node.tagName, class: node.className, hidden: node.hasAttribute('hidden'), display: getComputedStyle(node).display })
        return ancestors
      }))
      throw error
    })
    await expect(page.getByText('Sommerfest', { exact: true }).first()).toBeVisible()
    expect(await app.evaluate(() => (globalThis as any).reportTestRuns)).toBe(1)
    const tags = await page.evaluate(() => window.api.tags.list({ includeUsage: true }))
    expect(tags.rows.some(tag => tag.name === 'Sommerfest')).toBe(false)
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
})
