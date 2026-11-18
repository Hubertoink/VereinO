import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/finance/managementKpis.css', 'src/renderer/views/Advances/advances.css', 'src/renderer/components/modalHeader.css', 'src/renderer/views/Mitglieder/memberHistory.css', 'src/renderer/views/Mitglieder/memberGroups.css', 'src/renderer/components/compactPopover.css', 'src/renderer/views/invoicesShared/invoiceDetail.css', 'src/renderer/views/reimbursements/reimbursements.css'].map(f => fs.readFile(f, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { installSelectKeyboardGuard } from './src/renderer/utils/selectKeyboard'
    installSelectKeyboardGuard()
    import { createRoot } from 'react-dom/client'
    import { useOverlayScrollLock } from './src/renderer/hooks/useOverlayScrollLock'
    import MembersView from './src/renderer/views/Mitglieder/MembersView'
    import InvoicesView from './src/renderer/views/InvoicesView'
    import RecurringBookingsView from './src/renderer/views/RecurringBookings/RecurringBookingsView'
    import AdvancesView from './src/renderer/views/Advances/AdvancesView'
    window.requests = []
    window.memberAmount = 95
    window.historyRequests = []; window.memberUpdates = []
    const historyRows = [
      { id: 3, action: 'UPDATE', createdAt: '2026-11-18T12:30:00Z', changes: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }, { field: 'email', before: 'erika@example.org', after: 'neu@example.org' }, { field: 'notes', before: null, after: 'Hinweise zum Mitglied und zur Erreichbarkeit. '.repeat(8) }] },
      { id: 2, action: 'UPDATE', createdAt: '2026-11-17T10:00:00Z', changes: [{ field: 'contribution_amount', before: 10, after: 15 }] },
      { id: 1, action: 'CREATE', createdAt: '2026-11-01T10:00:00Z', changes: [{ field: 'name', before: null, after: 'Erika Muster' }] }
    ]
    const advance = { id: 1, recipientName: 'Erika Muster', memberName: 'Erika Muster', issuedAt: '2026-09-01', amount: 500, spentAmount: 100, openAmount: 400, settledAmount: 0, settlementCount: 0, status: 'OPEN', settlements: [], purchases: [] }
    window.api = {
      tags: { list: async () => ({ rows: [] }) },
      paymentAccounts: { list: async () => ({ rows: [] }) },
      bindings: { list: async () => ({ rows: [] }) },
      advances: { list: async () => ({ rows: [advance], total: 1 }), get: async () => advance },
      recurringBookings: { summary: async () => ({ due: 1, upcoming: 2, active: 3, paused: 0 }), list: async () => ({ rows: [{ id: 1, name: 'Adobe Photoshop', description: 'Vereinssoftware', counterparty: 'Adobe Inc.', type: 'OUT', sphere: 'IDEELL', amount: 10, amountMode: 'GROSS', vatRate: 0, paymentAccountName: 'Volksbank', frequency: 'MONTHLY', nextDueDate: '2026-09-01', status: 'ACTIVE', dueCount: 1, budgets: [], earmarks: [], tags: [] }] }) },
      members: {
        groups: { list: async () => [] },
        history: async input => { window.historyRequests.push(input); if (window.historyFailure) throw Error('offline'); return { rows: window.emptyHistory ? [] : input.beforeId ? historyRows.slice(2) : historyRows.slice(0, 2), hasMore: !window.emptyHistory && !input.beforeId } },
        update: async input => { window.memberUpdates.push(input); return { id: input.id } },
        list: async input => { window.requests.push(input); return { rows: [{ id: 1, name: 'Erika Muster', memberNo: '0001', status: 'ACTIVE', join_date: '2026-01-01', email: 'erika@example.org', contribution_amount: 10, contribution_interval: 'MONTHLY' }], total: 45, summary: input.includeSummary ? { active: 42, dueMembers: 2, dueAmount: window.memberAmount } : undefined } } },
      payments: { status: async () => ({ hasPlan: 1, state: 'OVERDUE', overdue: 2 }) },
      budgets: { list: async () => ({ rows: [{ id: 1, name: 'Jugendarbeit', year: 2026 }] }) },
      reimbursements: { list: async () => [
        { id: 1, title: 'Renovierung', partner: 'Partner A', dueDate: '2026-09-10', expectedCents: 20000, paidCents: 5000, remainingCents: 15000, status: 'PARTIAL' },
        { id: 2, title: 'Material', partner: 'Partner B', dueDate: null, expectedCents: 1000, paidCents: 1000, remainingCents: 0, status: 'PAID' }
      ] },
      invoiceFiles: { open: async () => { window.fileOpened = true; return { ok: true } } },
      invoices: { get: async () => ({ id: 1, date: '2026-09-01', dueDate: '2026-09-10', party: 'Bürobedarf Muster', description: 'Material für die Jugendarbeit', invoiceNo: 'R-12', voucherType: 'OUT', grossAmount: 200, paidSum: 50, status: 'PARTIAL', sphere: 'IDEELL', budgets: [{ budgetId: 1, amount: 200 }], earmarks: [], payments: [{ id: 1, date: '2026-09-05', amount: 50 }], files: [{ id: 1, fileName: 'Eine sehr lange Rechnung für Material.pdf', size: 25000, createdAt: '2026-09-01 12:00:00' }], tags: [] }), list: async () => ({ total: 40, rows: [{ id: 1, date: '2026-09-01', dueDate: '2026-09-10', party: 'Bürobedarf Muster', invoiceNo: 'R-12', voucherType: 'OUT', grossAmount: 200, paidSum: 50, status: 'PARTIAL', sphere: 'IDEELL' }, { id: 2, date: '2026-09-01', dueDate: '2026-09-10', party: 'Bezahlte Rechnung', voucherType: 'IN', grossAmount: 100, paidSum: 100, status: 'PAID', sphere: 'IDEELL' }] }), summary: async () => ({ count: 40, gross: 1000, paid: 700, remaining: 300, remainingIn: 110, remainingOut: 190, overdueAmount: 150, overdueCount: 1 }) }
    }
    const root = createRoot(document.getElementById('root'))
    function App({ view, task }) {
      useOverlayScrollLock()
      if (view === 'recurring') return <RecurringBookingsView notify={() => {}} />
      if (view === 'advances') return <AdvancesView />
      return view === 'members' ? <MembersView initialTask={task} /> : <InvoicesView />
    }
    window.mount = (view, task) => root.render(<App view={view} task={task} />)
    window.mount('members')
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', external: ['pdfjs-dist/*'], loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'toast', setup(build) {
    build.onResolve({ filter: /\/(LocalInvoiceScanModal|InvoiceBatchControl|MembersExportModal)$/ }, args => ({ path: args.path, namespace: 'unused-modal' }))
    build.onLoad({ filter: /.*/, namespace: 'unused-modal' }, () => ({ contents: 'export default function Modal() { return null }', loader: 'js' }))
    build.onResolve({ filter: /\/context\/useToast$/ }, args => ({ path: args.path, namespace: 'mock-toast' }))
    build.onLoad({ filter: /.*/, namespace: 'mock-toast' }, () => ({ contents: 'export const useToast = () => ({ notify: () => {} })', loader: 'js' }))
  } }] })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://management.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://management.test/')
  await page.setViewportSize({ width: 1500, height: 950 })
  await page.addStyleTag({ content: css })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addScriptTag({ content: script })
  expect(errors).toEqual([])
})

test('the invitation AI fills only the message, fits the label row and ignores dismissed drafts', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window as any
    fixture.aiRequests = []
    fixture.api.members.audience = async () => [{ id: 1, name: 'Erika Muster', email: 'erika@example.org' }]
    fixture.api.ai = {
      settings: { get: async () => ({ hasApiKey: !!fixture.aiAvailable }) },
      text: { generate: (payload: unknown) => {
        fixture.aiRequests.push(payload)
        return new Promise((resolve, reject) => {
          fixture.finishDraft = (body: string) => resolve({ title: 'Vorschlag', body, notes: [] })
          fixture.failDraft = () => reject(new Error('Anbieter nicht erreichbar'))
        })
      } }
    }
  })
  const invite = page.getByRole('button', { name: 'Einladen (E-Mail)', exact: true })
  const message = page.getByLabel('Nachricht', { exact: true })
  const trigger = page.getByRole('button', { name: 'Nachricht mit KI formulieren', exact: true })
  const promptWindow = page.getByRole('dialog', { name: 'Nachricht mit KI formulieren' })
  const prompt = promptWindow.getByRole('textbox')
  const generate = promptWindow.getByRole('button', { name: 'Nachricht formulieren' })
  const fieldHeight = () => message.evaluate(el => el.parentElement!.offsetHeight)
  await invite.click()
  await expect(page.getByLabel('Empfänger (BCC)', { exact: true })).toHaveValue('erika@example.org')
  await expect(trigger).toHaveCount(0)
  const height = await fieldHeight()
  await message.fill('Mein bisheriger Entwurf')
  await page.keyboard.press('Escape')
  await page.evaluate(() => { (window as any).aiAvailable = true })
  await invite.click()
  await expect(trigger).toBeVisible()
  expect(await fieldHeight()).toBe(height)
  await trigger.click()
  await expect(prompt).toBeFocused()
  await expect(generate).toBeDisabled()
  await prompt.fill('Freitag um 17 Uhr trainieren')
  await generate.click()
  await page.evaluate(() => (window as any).failDraft())
  await expect(promptWindow.getByRole('alert')).toContainText('Anbieter nicht erreichbar')
  await expect(message).toHaveValue('Mein bisheriger Entwurf')
  await expect(prompt).toHaveValue('Freitag um 17 Uhr trainieren')
  await generate.click()
  await page.keyboard.press('Escape')
  await expect(promptWindow).toHaveCount(0)
  await page.evaluate(() => (window as any).finishDraft('Veraltete Antwort'))
  await expect(message).toHaveValue('Mein bisheriger Entwurf')
  await trigger.click()
  await prompt.fill('Am Samstag ab 10 Uhr den Platz aufräumen')
  await prompt.press('Control+Enter')
  await expect(promptWindow.getByRole('button', { name: 'Wird formuliert …' })).toBeDisabled()
  await page.evaluate(() => (window as any).finishDraft('Hallo zusammen,\n\nwir treffen uns am Samstag um 10 Uhr.'))
  await expect(promptWindow).toHaveCount(0)
  await expect(message).toHaveValue('Hallo zusammen,\n\nwir treffen uns am Samstag um 10 Uhr.')
  await expect(message).toBeFocused()
  await expect(page.getByLabel('Betreff', { exact: true })).toHaveValue('Einladung zur Sitzung')
  await expect(page.getByLabel('Empfänger (BCC)', { exact: true })).toHaveValue('erika@example.org')
  expect(await page.evaluate(() => (window as any).aiRequests.at(-1))).toEqual({
    type: 'INVITATION', prompt: 'Am Samstag ab 10 Uhr den Platz aufräumen', includeOrganizationContext: false
  })
  await message.fill('Bearbeitet')
  await page.keyboard.press('Escape')
  await invite.click()
  await expect(message).toHaveValue('Bearbeitet')
})

async function checkMemberFinanceHover(page: Page) {
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  const interval = page.locator('#member-contribution-interval')
  await interval.scrollIntoViewIfNeeded()
  await page.locator('.member-modal-body').evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.mouse.move(0, 0)
  const bounds = () => page.locator('.member-modal-body .card, .member-finance-grid .input').evaluateAll(elements => elements.map(el => {
    const { x, y, width, height } = el.getBoundingClientRect()
    return { x, y, width, height }
  }))
  await page.waitForTimeout(300)
  const before = await bounds()
  const grid = page.locator('.member-modal-body')
  const screenshotOptions = { mask: [interval.locator('..')], animations: 'disabled' as const }
  const beforeImage = await grid.screenshot(screenshotOptions)
  await fs.writeFile(test.info().outputPath('before-hover.png'), beforeImage)
  await test.info().attach('before-hover', { body: beforeImage, contentType: 'image/png' })
  for (let i = 0; i < 3; i++) {
    await interval.hover()
    expect(await bounds()).toEqual(before)
    const afterImage = await grid.screenshot(screenshotOptions)
    await fs.writeFile(test.info().outputPath(`after-hover-${i}.png`), afterImage)
    await test.info().attach(`after-hover-${i}`, { body: afterImage, contentType: 'image/png' })
    const changedPixels = await page.evaluate(async ([before, after]) => {
      const images = await Promise.all([before, after].map(async encoded => {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
        const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        image.close()
        return context.getImageData(0, 0, canvas.width, canvas.height).data
      }))
      let changed = 0
      for (let pixel = 0; pixel < images[0].length; pixel += 4) {
        // Ignore tiny antialiasing colour differences; a moved border or text
        // changes pixel positions and exceeds this per-channel tolerance.
        if ([0, 1, 2, 3].some(channel => Math.abs(images[0][pixel + channel] - images[1][pixel + channel]) > 3)) changed++
      }
      return changed
    }, [beforeImage.toString('base64'), afterImage.toString('base64')])
    expect(changedPixels).toBe(0)
    await page.mouse.move(0, 0)
    expect(await bounds()).toEqual(before)
  }
  await interval.click()
  await page.getByRole('option', { name: 'Monatlich', exact: true }).click()
  await expect(interval).toHaveValue('MONTHLY')
  await interval.click()
  await expect.poll(() => interval.evaluate(el => el.matches(':open'))).toBe(true)
  await interval.press('Escape')
  await expect.poll(() => interval.evaluate(el => el.matches(':open'))).toBe(false)
  await expect(interval).toBeVisible()
  await expect(interval).toHaveValue('MONTHLY')
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
}

test('opening overdue members reapplies the contribution filter on the already open page', async ({ page }) => {
  const search = page.getByPlaceholder('Suche (Name, E-Mail, Tel., Nr.)')
  await search.fill('Andere Suche')
  await expect.poll(() => page.evaluate(() => (window as any).requests.at(-1)?.q)).toBe('Andere Suche')
  await page.evaluate(() => (window as any).mount('members', { kind: 'members', filter: 'overdue' }))
  await expect(search).toHaveValue('')
  await expect.poll(() => page.evaluate(() => {
    const request = (window as any).requests.at(-1)
    return { filter: request?.contributionFilter, q: request?.q || '', offset: request?.offset }
  })).toEqual({ filter: 'DUE', q: '', offset: 0 })
  await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).requests.at(-1)?.contributionFilter)).toBe('ALL')
  await page.evaluate(() => (window as any).mount('members', { kind: 'members', filter: 'overdue' }))
  await expect.poll(() => page.evaluate(() => (window as any).requests.at(-1)?.contributionFilter)).toBe('DUE')
})

test('member finance fields stay in place when hovering the interval', async ({ page }) => {
  await page.setViewportSize({ width: 845, height: 838 })
  await checkMemberFinanceHover(page)
})

async function checkMemberScrollBoundary(page: Page) {
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  const body = page.locator('.member-modal-body')
  await expect(body).toHaveCSS('overscroll-behavior-y', 'none')
  await page.waitForTimeout(300)
  await body.evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight - 10 })
  const outer = () => page.locator('.modal-overlay, .member-modal, .compact-booking-popup__content, .member-modal-body').evaluateAll(elements => elements.map(el => {
    const { x, y, width, height } = el.getBoundingClientRect()
    return { x, y, width, height, scrollTop: el.classList.contains('member-modal-body') ? undefined : el.scrollTop }
  }))
  const before = await outer()
  await page.locator('#member-bic').hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => body.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThanOrEqual(1)
  expect(await outer()).toEqual(before)
  const bottom = await body.evaluate(el => el.scrollTop)
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(100)
    expect(await outer()).toEqual(before)
    expect(await body.evaluate(el => el.scrollTop)).toBe(bottom)
  }
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
}

test('member dialog keeps its outer containers still at the wheel scroll boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 })
  await checkMemberScrollBoundary(page)
})

test('member finance hover and selection remain stable in the installed Electron renderer', async ({}, info) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-member-layout-'))
  const main = path.join(dir, 'main.cjs')
  await fs.writeFile(main, `
    const { app, BrowserWindow } = require('electron')
    app.whenReady().then(() => {
      global.window = new BrowserWindow({ width: 960, height: 820 })
      window.loadURL('data:text/html,<html data-theme="light" data-color-theme="soft-blush"><title>VereinO Layoutprüfung</title><div id="root"></div></html>')
    })
    app.on('window-all-closed', () => app.quit())
  `)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [main], env })
  try {
    const page = await app.firstWindow()
    await page.locator('#root').waitFor({ state: 'attached' })
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    for (const zoom of [1, 1.25]) {
      await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value), zoom)
      await checkMemberFinanceHover(page)
      await checkMemberScrollBoundary(page)
    }
    await page.getByRole('button', { name: 'Neu', exact: true }).click()
    await page.locator('#member-contribution-interval').scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('member-finance-electron.png') })
  } finally {
    await app.close()
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('members show whole-selection KPIs, readable status and contribution interval and refresh after payment', async ({ page }, info) => {
  const overview = page.getByRole('region', { name: 'Mitgliederübersicht' })
  await expect(overview).toContainText('42')
  await expect(overview).toContainText('95,00')
  await expect(page.locator('.management-status')).toHaveText('Aktiv')
  await expect(page.locator('.management-contribution-interval')).toHaveText('pro Monat')
  await page.evaluate(() => { (window as any).memberAmount = 75; window.dispatchEvent(new Event('data-changed:members')) })
  await expect(overview).toContainText('75,00')
  await page.screenshot({ path: info.outputPath('members-kpis.png'), fullPage: true })
})

test('invoices separate open directions and show progress and overdue hints only on unpaid rows', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  const overview = page.getByRole('region', { name: 'Verbindlichkeitenübersicht' })
  await expect(overview).toContainText('190,00')
  await expect(overview).toContainText('110,00')
  await expect(overview).toContainText('150,00')
  const partial = page.getByRole('row').filter({ hasText: 'Bürobedarf Muster' })
  await expect(partial).toContainText('Teilbezahlt')
  await expect(partial).toContainText('25 % bezahlt')
  await expect(partial).toContainText('überfällig')
  await expect(page.getByRole('row').filter({ hasText: 'Bezahlte Rechnung' }).locator('.management-due')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('invoice-kpis.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await overview.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})


test('reimbursements show filtered amounts and reimbursement progress', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  await page.getByRole('button', { name: 'Kostenerstattungen', exact: true }).click()
  const title = await page.getByRole('heading', { name: 'Kostenerstattungen', exact: true }).boundingBox()
  const search = await page.getByRole('textbox', { name: 'Kostenerstattungen suchen' }).boundingBox()
  expect(Math.abs((title!.y + title!.height / 2) - (search!.y + search!.height / 2))).toBeLessThan(4)
  const kpis = page.getByRole('region', { name: 'Kostenerstattungsübersicht' })
  await expect(kpis).toContainText('150,00')
  await expect(kpis).toContainText('60,00')
  await expect(page.getByRole('row').filter({ hasText: 'Renovierung' })).toContainText('25 % erstattet')
  await page.getByRole('button', { name: 'Status filtern', exact: true }).click()
  await page.getByRole('combobox', { name: 'Status filtern' }).selectOption('PAID')
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
  await expect(kpis).toContainText('10,00')
  await expect(kpis).not.toContainText('150,00')
  await page.getByRole('button', { name: 'Alle Filter löschen', exact: true }).click()
  await page.screenshot({ path: info.outputPath('reimbursements-kpis.png'), fullPage: true })
})

test('invoice details prioritize payment figures and disclose named assignments and file actions', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  await page.getByRole('row').filter({ hasText: 'Bürobedarf Muster' }).dblclick()
  const modal = page.getByRole('dialog', { name: 'Rechnungsdetails' })
  const title = modal.getByRole('heading', { name: 'Verbindlichkeit #R-12', exact: true })
  await expect(title).toHaveCSS('font-size', '16px')
  await expect(modal.getByRole('region', { name: 'Zahlungsübersicht' })).toContainText('150,00')
  await expect(modal.locator('details')).toHaveCount(0)
  expect(await modal.getByRole('cell', { name: '200,00 €', exact: true }).evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(60)
  await page.screenshot({ path: info.outputPath('invoice-detail-cards.png'), fullPage: true, animations: 'disabled' })
  await expect(modal.getByRole('cell', { name: 'Jugendarbeit', exact: true })).toBeVisible()
  await expect(modal.getByText('Eine sehr lange Rechnung für Material.pdf')).toBeVisible()
  const payments = await modal.getByRole('region', { name: 'Zahlungen', exact: true }).boundingBox()
  const files = await modal.getByRole('region', { name: 'Anhänge', exact: true }).boundingBox()
  expect(files!.y).toBeCloseTo(payments!.y, 0)
  expect(files!.x).toBeGreaterThan(payments!.x)
  await modal.getByRole('button', { name: 'Eine sehr lange Rechnung für Material.pdf' }).click()
  expect(await page.evaluate(() => (window as any).fileOpened)).toBe(true)
  await page.setViewportSize({ width: 500, height: 900 })
  await page.evaluate(() => document.documentElement.dataset.uiDensity = 'standard')
  await expect(title).toHaveCSS('font-size', '20px')
  expect(await modal.locator('.invoice-detail-refined').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
})


test('invoice filter select opens above its panel and selects without closing the filter', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mount('invoices'))
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  const select = page.locator('select').filter({ has: page.locator('option[value="IDEELL"]') })
  await select.click()
  await expect(page.getByRole('option', { name: 'IDEELL', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('invoice-filter-select.png') })
  await page.getByRole('option', { name: 'IDEELL', exact: true }).click()
  await expect(select).toHaveValue('IDEELL')
  await expect(select).toBeVisible()
  await select.click()
  await page.keyboard.press('Escape')
  await expect(select).toBeVisible()
})


for (const [view, selector] of [
  ['members', '.members-table tbody tr'],
  ['invoices', '.invoices-table tbody tr'],
  ['recurring', '.recurring-table tbody tr'],
  ['advances', '.advances-recipient-row']
]) {
  test(`${view}: compact reduces row height and standard restores it`, async ({ page }, info) => {
    await page.evaluate(view => (window as any).mount(view), view)
    const row = page.locator(selector).first()
    await expect(row).toBeVisible()
    if (view === 'recurring') await expect(row).toContainText('Adobe Photoshop')
    const heading = page.getByRole('heading', { level: 1 }).first()
    const value = view === 'advances' ? row.locator('.advances-recipient-amount strong') : row.locator('td').nth(1)
    const metric = page.locator('.management-kpi > strong, .recurring-summary-card strong, .advances-summary-value').first()
    const tableHeading = page.locator('thead th:visible').last()
    const compactHeight = (await row.boundingBox())!.height
    await expect(heading).toHaveCSS('font-size', '18px')
    await expect(value).toHaveCSS('font-size', '12px')
    await expect(metric).toHaveCSS('font-size', '16px')
    if (view !== 'advances') await expect(tableHeading).toHaveCSS('font-size', '12px')
    if (view === 'recurring') await expect(row.locator('small').first()).toHaveCSS('font-size', '11px')
    await page.screenshot({ path: info.outputPath(`${view}-compact.png`), animations: 'disabled', fullPage: true })
    await page.evaluate(() => document.documentElement.dataset.uiDensity = 'standard')
    expect((await row.boundingBox())!.height).toBeGreaterThan(compactHeight)
    await expect(heading).toHaveCSS('font-size', '24px')
    await expect(value).toHaveCSS('font-size', '16px')
    await expect(metric).toHaveCSS('font-size', '20px')
    if (view !== 'advances') await expect(tableHeading).toHaveCSS('font-size', '13px')
    await page.screenshot({ path: info.outputPath(`${view}-standard.png`), animations: 'disabled', fullPage: true })
    await page.evaluate(() => document.documentElement.dataset.uiDensity = 'compact')
    expect((await row.boundingBox())!.height).toBeCloseTo(compactHeight, 0)
    await expect(value).toHaveCSS('font-size', '12px')
  })
}


test('member history opens beside status, paginates and preserves the unsaved edit on Escape', async ({ page }, info) => {
  await page.locator('.members-table .btn-edit').click()
  const editor = page.getByRole('dialog', { name: 'Mitglied bearbeiten' })
  await editor.locator('#member-name').fill('Ungespeicherter Entwurf')
  const trigger = editor.getByRole('button', { name: 'Änderungsverlauf anzeigen' })
  await trigger.click()
  const history = page.getByRole('dialog', { name: 'Änderungsverlauf', exact: true })
  await expect(history).toBeVisible()
  await expect(history.getByRole('button', { name: 'Historie schließen' })).toBeFocused()
  await expect(history.locator('.member-history-entry')).toHaveCount(2)
  await expect(history).toContainText('Pausiert')
  await expect(history).toContainText('neu@example.org')
  await expect(history).toContainText('15,00')
  await page.keyboard.press('Control+s')
  expect(await page.evaluate(() => (window as any).memberUpdates)).toEqual([])
  await history.getByRole('button', { name: 'Ältere Änderungen laden' }).click()
  await expect(history.locator('.member-history-entry')).toHaveCount(3)
  await expect(history.getByRole('button', { name: 'Ältere Änderungen laden' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).historyRequests.at(-1))).toMatchObject({ memberId: 1, beforeId: 2 })
  for (const width of [1100, 390]) {
    await page.evaluate(width => { document.documentElement.dataset.theme = width === 390 ? 'dark' : 'light'; document.documentElement.dataset.colorTheme = width === 390 ? 'earthy-tones' : 'professional-light' }, width)
    await page.setViewportSize({ width, height: 700 })
    expect(await history.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await expect(history.getByRole('button', { name: 'Historie schließen' })).toBeInViewport()
    if (width === 390) {
      const values = history.locator('.member-history-change').first().locator('dd')
      const before = (await values.nth(0).boundingBox())!, after = (await values.nth(1).boundingBox())!
      expect(before.width).toBeGreaterThan(120)
      expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(1)
    }
    const bounds = (await history.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(700)
    await history.locator('.member-history-body').evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(history.locator('.member-history-entry').last()).toBeInViewport()
    await history.locator('.member-history-body').evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: info.outputPath(`member-history-${width}.png`), animations: 'disabled' })
  }
  await page.keyboard.press('Escape')
  await expect(history).toHaveCount(0)
  await expect(editor).toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(editor.locator('#member-name')).toHaveValue('Ungespeicherter Entwurf')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})

test('member history retries loading errors and explains the empty history of existing members', async ({ page }) => {
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Änderungsverlauf anzeigen' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await page.evaluate(() => { (window as any).historyFailure = true })
  await page.locator('.members-table .btn-edit').click()
  await page.getByRole('button', { name: 'Änderungsverlauf anzeigen' }).click()
  const history = page.getByRole('dialog', { name: 'Änderungsverlauf', exact: true })
  await expect(history.getByRole('alert')).toContainText('nicht geladen')
  await page.evaluate(() => { (window as any).historyFailure = false; (window as any).emptyHistory = true })
  await history.getByRole('button', { name: 'Erneut versuchen' }).click()
  await expect(history).toContainText('Noch keine Änderungen protokolliert.')
  await expect(history).toContainText('Änderungen vor Einführung des Verlaufs sind nicht enthalten.')
  await page.keyboard.press('Tab')
  expect(await history.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await history.getByRole('button', { name: 'Historie schließen' }).click()
  await expect(page.getByRole('dialog', { name: 'Mitglied bearbeiten' })).toBeVisible()
})
