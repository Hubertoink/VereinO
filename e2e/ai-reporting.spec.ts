import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/views/DashboardPlus/dashboardPlus.css', 'src/renderer/views/AI/AIView.css', 'src/renderer/components/ai/reportAnswer.css'].map(file => readFile(file, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import DashboardAssistant from './src/renderer/views/DashboardPlus/DashboardAssistant'
    import { AiMessageList } from './src/renderer/views/AI/AiMessageList'
    import { takeAgentReview } from './src/renderer/utils/aiAgentHandoff'
    window.addEventListener('ai:continue-agent', () => { window.reviewHandoff = takeAgentReview('test') })
    import { buildReportFinance } from './shared/aiReporting'
    window.requests = []; window.sources = []; window.fail = false; window.pending = false; window.empty = false
    window.api = {
      organizations: { active: async () => ({ organization: { id: 'test' } }), onSwitched: callback => { window.switchOrg = callback; return () => {} } },
      ai: { settings: { get: async () => ({ hasApiKey: true }) }, agent: { run: async request => {
        const input = { ...request.uiContext.reportingScope, question: request.prompt, sessionId: request.sessionId }
        window.requests.push(input)
        if (window.fail) throw Error('Verbindung unterbrochen. Bitte erneut versuchen.')
        const rows = window.empty || input.to < '2026-08-01' || input.from > '2026-08-31' ? [] : [{ month: '2026-08', gross: 910 }]
        const finance = buildReportFinance(input, rows, rows.map(row => ({ ...row, gross: -1693.75 })), 0, '2026-11-07T12:00:00Z')
        const result = { title: 'So hat sich euer Saldo entwickelt', summary: 'Die Ausgaben übersteigen die Einnahmen. Die Veränderung konzentriert sich auf August.', notes: ['Die Werte stammen aus den gebuchten Einnahmen und Ausgaben.'], blocks: [{ type: 'metrics', data: 'finance' }, { type: 'balance', data: 'finance' }], datasets: { finance } }
        window.lastReport = result
        const response = { sessionId: 'test-session', answer: result.summary + (window.extraText || ''), reports: [result], drafts: window.drafts || [], trace: [], toolCalls: [] }
        if (window.pending) return new Promise(resolve => window.finishReport = () => resolve(response))
        return response
      } } }
    }
    const root = createRoot(document.getElementById('root'))
    window.addEventListener('apply-voucher-jump', event => window.sources.push(event.detail))
    window.renderAgentReport = () => root.render(<AiMessageList messages={[{ id: 'report', role: 'assistant', body: window.lastReport.summary + (window.extraText || ''), reports: [window.lastReport], reportQuestion: 'Wie hat sich unser Saldo entwickelt?' }]} onReportFollowUp={(question, scope) => window.requests.push({ question, ...scope })} onOpenVoucher={() => {}} onOpenJob={() => {}} onOpenBookingDraftFromJob={() => {}} onOpenMessageDraft={() => {}} onShowFile={() => {}} />)
    root.render(<div className="dashboard-plus"><DashboardAssistant from="2025-12-01" to="2026-11-07" onSetup={() => {}} onSource={source => window.sources.push(source)} /></div>)
  ` }, bundle: true, jsx: 'automatic', platform: 'browser', write: false, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1050 })
  await page.setContent('<html data-theme="light" data-color-theme="soft-blush"><div id="root"></div></html>')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await expect(page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true })).toBeEnabled()
})

const ask = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true }).click()
  await page.getByRole('button', { name: 'Frage senden' }).click()
  await expect(page.getByRole('heading', { name: 'So hat sich euer Saldo entwickelt' })).toBeVisible()
}

test('calculated metrics, chart points and source actions refer to the same scoped data', async ({ page }) => {
  await ask(page)
  await expect(page.locator('.ai-report-metrics')).toContainText('910,00')
  await expect(page.locator('.ai-report-metrics')).toContainText('1.693,75')
  await expect(page.locator('.ai-report-metrics')).toContainText('-783,75')
  await page.getByRole('button', { name: 'Einnahmen ansehen', exact: true }).click()
  expect(await page.evaluate(() => (window as any).sources[0])).toEqual({ from: '2025-12-01', to: '2026-11-07', type: 'IN' })
  const august = page.getByRole('button', { name: /^August 2026: Bestand/ })
  await august.focus()
  await expect(page.locator('.ai-report-month-detail')).toContainText('August 2026')
  await august.press('Enter')
  expect(await page.evaluate(() => (window as any).sources[1])).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  await page.getByRole('button', { name: 'Einnahmen / Ausgaben', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Einnahmen / Ausgaben', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.ai-report-month-detail')).toContainText('Veränderung')
  await page.getByText('Datenbasis und Monatswerte', { exact: true }).click()
  await expect(page.getByRole('table')).toContainText('01.08.2026 – 31.08.2026')
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(12)
})

test('follow-ups preserve the original scope even after the date controls change', async ({ page }) => {
  await page.getByLabel('Auswertung von').fill('2026-08-12')
  await ask(page)
  await page.getByLabel('Auswertung von').fill('2026-10-01')
  await page.getByRole('button', { name: 'Erkläre die Entwicklung kurz für den Vorstand.' }).click()
  await expect(page.getByLabel('Frage zu Reporting oder Controlling')).toHaveValue('Erkläre die Entwicklung kurz für den Vorstand.')
  await page.getByRole('button', { name: 'Frage senden' }).click()
  await expect(page.locator('.ai-report-answer')).toHaveCount(2)
  const request = await page.evaluate(() => (window as any).requests[1])
  expect(request.from).toBe('2026-08-12')
  expect(request.sessionId).toBe('test-session')
  await page.locator('.ai-report-answer').first().getByRole('button', { name: /^August 2026: Bestand/ }).click()
  expect(await page.evaluate(() => (window as any).sources[0])).toEqual({ from: '2026-08-12', to: '2026-08-31' })
})

test('empty datasets remain explicit, and source changes mark earlier answers as snapshots', async ({ page }) => {
  await page.evaluate(() => { (window as any).empty = true })
  await ask(page)
  await expect(page.locator('.ai-report-notice')).toContainText('Keine Einnahmen- oder Ausgabenbuchungen')
  expect(await page.locator('.ai-report-plot svg').innerHTML()).not.toMatch(/NaN|Infinity/)
  await page.evaluate(() => window.dispatchEvent(new Event('data-changed:vouchers')))
  await expect(page.locator('.dp-ai-stale')).toContainText('inzwischen geändert')
})

test('errors retain the question for retry and invalid date ranges cannot be submitted', async ({ page }) => {
  await page.evaluate(() => { (window as any).fail = true })
  await page.getByLabel('Frage zu Reporting oder Controlling').fill('Wie steht unser Saldo?')
  await page.getByRole('button', { name: 'Frage senden' }).click()
  await expect(page.getByRole('alert')).toContainText('Verbindung unterbrochen')
  await expect(page.getByLabel('Frage zu Reporting oder Controlling')).toHaveValue('Wie steht unser Saldo?')
  await page.evaluate(() => { (window as any).fail = false })
  await page.getByRole('button', { name: 'Frage senden' }).click()
  await expect(page.locator('.ai-report-answer')).toHaveCount(1)
  await page.getByLabel('Auswertung von').fill('2027-01-01')
  await expect(page.getByRole('button', { name: 'Frage senden' })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('gültigen Zeitraum')
})

test('late responses cannot reappear after a new chat or organization switch', async ({ page }) => {
  for (const reset of ['new', 'organization']) {
    await page.evaluate(() => { (window as any).pending = true })
    await page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true }).click()
  await page.getByRole('button', { name: 'Frage senden' }).click()
    await expect(page.locator('.dp-assistant-icon--busy')).toBeVisible()
    if (reset === 'new') await page.getByRole('button', { name: 'Neuer Chat' }).click()
    else await page.evaluate(() => (window as any).switchOrg())
    await page.evaluate(() => (window as any).finishReport())
    await expect(page.locator('.ai-report-answer')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true })).toBeEnabled()
  }
})

test('report layouts fit desktop and narrow windows in light and dark themes', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await ask(page)
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme
      document.documentElement.dataset.colorTheme = theme === 'dark' ? 'default' : 'soft-blush'
    }, theme)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1050 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await page.locator('.ai-report-answer').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.locator('.ai-report-answer').screenshot({ path: info.outputPath(`report-${theme}-${width}.png`), animations: 'disabled' })
    }
  }
  expect(errors).toEqual([])
})

test('the dashboard uses only the main scroll container, without blank document overflow', async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.dataset.backgroundImage = 'niko-bg'
    const dashboard = document.querySelector('.dashboard-plus')!
    const shell = document.createElement('div')
    shell.className = 'app-root-grid app-root-grid--top'
    shell.innerHTML = '<header class="app-header">VereinO</header><main class="app-main"></main>'
    const spacer = document.createElement('div')
    spacer.style.height = '1000px'
    dashboard.prepend(spacer)
    shell.querySelector('main')!.append(dashboard)
    document.getElementById('root')!.append(shell)
  })
  for (const withAnswer of [false, true]) {
    if (withAnswer) await ask(page)
    await page.locator('.app-main').evaluate(element => { element.scrollTop = 0 })
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1050)
    await page.locator('.app-main').evaluate(element => { element.scrollTop = element.scrollHeight })
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1050)
    expect(await page.locator('.app-main').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    const gap = await page.evaluate(() => document.querySelector('.app-main')!.getBoundingClientRect().bottom - document.querySelector('.dashboard-plus')!.getBoundingClientRect().bottom)
    expect(gap).toBeLessThanOrEqual(18)
  }
})

test('the agent chat renders the same report blocks, amounts and source links as the dashboard', async ({ page }, info) => {
  await ask(page)
  const metrics = await page.locator('.ai-report-metrics').textContent()
  await page.evaluate(() => (window as any).renderAgentReport())
  await expect(page.locator('.ai-message--report .ai-report-metrics')).toHaveText(metrics)
  await page.getByRole('button', { name: 'Ausgaben ansehen', exact: true }).click()
  expect(await page.evaluate(() => (window as any).sources[0])).toEqual({ from: '2025-12-01', to: '2026-11-07', type: 'OUT' })
  await page.getByRole('button', { name: 'Erkläre die Entwicklung kurz für den Vorstand.' }).click()
  expect(await page.evaluate(() => (window as any).requests[1].from)).toBe('2025-12-01')
  await page.locator('.ai-message--report').screenshot({ path: info.outputPath('agent-report.png'), animations: 'disabled' })
})

test('report summaries are shown once while additional findings remain in dashboard and chat', async ({ page }) => {
  await page.evaluate(() => { (window as any).extraText = '\n\nZwei Beiträge sind noch offen.' })
  await ask(page)
  const summary = 'Die Ausgaben übersteigen die Einnahmen. Die Veränderung konzentriert sich auf August.'
  await expect(page.getByText(summary, { exact: true })).toHaveCount(1)
  await expect(page.locator('.ai-report-addendum')).toHaveText('Zwei Beiträge sind noch offen.')
  await expect(page.locator('.ai-report-answer')).toHaveCount(1)
  await page.evaluate(() => (window as any).renderAgentReport())
  await expect(page.getByText(summary, { exact: true })).toHaveCount(1)
  await expect(page.getByText('Zwei Beiträge sind noch offen.', { exact: true })).toBeVisible()
})


test('suggestions only fill the input and allow editing the question and period before sending', async ({ page }) => {
  await page.getByRole('button', { name: 'Wie hat sich unser Saldo entwickelt?', exact: true }).click()
  const input = page.getByLabel('Frage zu Reporting oder Controlling')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Wie hat sich unser Saldo entwickelt?')
  expect(await page.evaluate(() => (window as any).requests)).toEqual([])
  await input.fill('Wie hat sich unser Saldo im August entwickelt?')
  await page.getByLabel('Auswertung von').fill('2026-08-01')
  await page.getByLabel('Auswertung bis').fill('2026-08-31')
  await page.evaluate(() => { (window as any).pending = true })
  await page.getByRole('button', { name: 'Frage senden' }).click()
  await expect(page.locator('.dp-assistant-icon--busy')).toBeVisible()
  expect(await page.evaluate(() => (window as any).requests[0])).toMatchObject({ question: 'Wie hat sich unser Saldo im August entwickelt?', from: '2026-08-01', to: '2026-08-31' })
  await page.evaluate(() => (window as any).finishReport())
  await expect(page.locator('.dp-assistant-icon--busy')).toHaveCount(0)
})


test('keeps the composer below answers and hands budget drafts to review without another run', async ({ page }) => {
  await page.evaluate(() => { (window as any).drafts = [{ kind: 'budgetChange', title: 'Budget Raumkosten', payload: { name: 'Raumkosten' } }] })
  await ask(page)
  const answers = page.locator('.dp-ai-answers')
  const form = page.locator('.dp-assistant form')
  expect(await answers.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('.dp-assistant form')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  const bounds = await answers.boundingBox()
  expect((await form.boundingBox())!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height)
  await page.getByRole('button', { name: 'Vorschläge im KI-Bereich prüfen' }).click()
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(1)
  expect(await page.evaluate(() => (window as any).reviewHandoff.result.drafts[0].kind)).toBe('budgetChange')
  await page.getByRole('button', { name: 'Neuer Chat' }).click()
  await expect(answers).toHaveCount(0)
  await expect(page.getByLabel('Frage zu Reporting oder Controlling')).toHaveValue('')
})
