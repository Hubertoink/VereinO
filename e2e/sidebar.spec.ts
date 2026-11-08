import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/shortcuts/shortcuts.css', 'src/renderer/components/layout/sidebar.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState, useEffect } from 'react'
    import { createRoot } from 'react-dom/client'
    import { AppSidebar } from './src/renderer/components/layout/AppSidebar'
    import { LeaderShortcuts } from './src/renderer/components/shortcuts/LeaderShortcuts'
    import { navItems, getProfileNavigationItems } from './src/renderer/utils/navItems'
    const root = createRoot(document.getElementById('root'))
    window.renderSidebar = (options = {}) => {
      const switches = new Set()
      window.requests = []; window.hold = false; window.fail = false; window.pending = []
      window.assignmentRequests = []
      window.budgetUsage = {}; window.earmarkUsage = {}; window.usageFailure = false
      window.bankImportCalls = 0; window.bankDates = {}; window.reminderSettings = {}; window.bankStatusFails = false
      window.budgets = options.assignments ? [
        { id: 1, name: 'Vorjahr', year: 2025 }, { id: 5, name: 'Jugend', year: 2026 },
        { id: 4, name: 'Veranstaltungen', year: 2026 }, { id: 3, name: 'Verwaltung', year: 2026 },
        { id: 6, name: 'Archiviert', year: 2027, isArchived: 1 }
      ] : []
      window.earmarks = options.assignments ? [
        { id: 1, name: 'Alt', isActive: 1 }, { id: 4, name: 'Spende Jugend', isActive: 1 },
        { id: 3, name: 'Projektförderung', isActive: 1 }, { id: 2, name: 'Ausstattung', isActive: 1 },
        { id: 5, name: 'Inaktiv', isActive: 0 }
      ] : []
      window.accounts = [
        { id: 1, name: 'Kasse', balance: 240, kind: 'CASH', isActive: 1 },
        { id: 2, name: 'Geschäftskonto', balance: 8420.50, kind: 'BANK', isActive: 1 },
        { id: 3, name: 'PayPal', balance: -125, kind: 'PAYPAL', isActive: 1 },
        { id: 4, name: 'Rücklagenkonto mit sehr langem Namen', balance: 1000000.24, kind: 'BANK', isActive: 1 }
      ]
      window.api = { app: { version: async () => ({ version: '4.11.0' }) },
        bankTransactions: { importStatus: async () => { window.bankImportCalls++; if (window.bankStatusFails) throw new Error('Unavailable'); return { accounts: window.accounts.map(a => ({ ...a, lastImportAt: window.bankDates[a.id] || null })) } } },
        paymentAccounts: { list: async () => ({ rows: window.accounts }) },
        settings: { get: async ({ key }) => ({ value: window.reminderSettings[key] }) },
        budgets: { list: async () => { window.assignmentRequests.push('budget'); return { rows: window.budgets } }, usage: async ({ budgetId }) => { if (window.usageFailure) throw new Error('Unavailable'); return window.budgetUsage[budgetId] || { inflow: 0, spent: 0 } } },
        bindings: { list: async () => { window.assignmentRequests.push('earmark'); return { rows: window.earmarks } }, usage: async ({ earmarkId }) => { if (window.usageFailure) throw new Error('Unavailable'); return window.earmarkUsage[earmarkId] || { allocated: 0, released: 0 } } },
        organizations: { onSwitched: cb => { switches.add(cb); return () => switches.delete(cb) } },
        reports: { cashBalance: async payload => {
          window.requests.push(payload)
          const snapshot = window.accounts.map(a => ({ ...a }))
          if (window.hold) await new Promise(resolve => window.pending.push(resolve))
          if (window.fail) throw new Error('Unavailable')
          return { accounts: snapshot }
        } }
      }
      window.switchOrg = () => switches.forEach(cb => cb())
      function Harness() {
        const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
        const [active, setActive] = useState('Buchungen')
        const [account, setAccount] = useState(null)
        const allowedItems = getProfileNavigationItems(options.general ? 'GENERAL' : 'NONPROFIT')
        const [items, setItems] = useState(options.minimal ? allowedItems.filter(i => ['Dashboard', 'Einstellungen'].includes(i.key)) : allowedItems)
        window.setModules = keys => setItems(allowedItems.filter(i => keys.includes(i.key)))
        useEffect(() => { localStorage.setItem('sidebarCollapsed', String(collapsed)) }, [collapsed])
        return <><div className="app-root-grid app-root-grid--side">
          <header className="app-header"><button>KommerzO</button></header>
          <AppSidebar activePage={active} onNavigate={setActive} collapsed={collapsed} onToggleCollapse={() => setCollapsed(v => !v)} items={items} navIconColorMode="color" openBankImportsCount={6} openInvoicesCount={3} selectedAccountId={account} onSelectAccount={id => { setAccount(id); setActive('Buchungen') }} onSelectAssignment={(kind, id) => { window.assignmentSelection = { kind, id }; setActive('Buchungen') }} onSelectBankAccount={options.bankImports ? id => { window.bankSelection = id; setActive('Bankimport') } : undefined} />
          <main className="app-main"><h1>{active}</h1><button onClick={() => setAccount(null)}>Kontofilter entfernen</button><p data-testid="filter">{account || 'Alle Konten'}</p><div className="card" style={{padding:24}}>Buchungsübersicht</div></main>
        </div><LeaderShortcuts commands={[]} /></>
      }
      root.render(<Harness />)
    }
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty', '.md': 'text' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('https://sidebar.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('https://sidebar.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('expands with labels, account balances and selection; remembers compact mode', async ({ page }, info) => {
  await page.evaluate(() => { localStorage.setItem('sidebarCollapsed', 'true'); (window as any).renderSidebar() })
  await expect(page.locator('.nav-label')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).requests)).toEqual([])
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '260px')
  await expect(page.getByRole('button', { name: 'Bankimport, 6 offen' })).toBeVisible()
  await expect(page.locator('.sidebar-account')).toHaveCount(3)
  await expect(page.locator('.sidebar-accounts')).toContainText('8.420,50')
  await expect(page.locator('.sidebar-account-balance.is-negative')).toContainText('-125,00')
  const payload = await page.evaluate(() => (window as any).requests[0])
  expect(Object.keys(payload)).toEqual(['to'])
  expect(payload.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await page.getByRole('button', { name: 'Alle Zahlkonten (4) …' }).click()
  await expect(page.locator('.sidebar-account')).toHaveCount(4)
  await page.locator('.sidebar-account').nth(1).click()
  await expect(page.getByTestId('filter')).toHaveText('2')
  await expect(page.locator('.sidebar-account').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: info.outputPath('sidebar-expanded.png') })
  await page.getByRole('button', { name: 'Kontofilter entfernen' }).click()
  await expect(page.locator('.sidebar-account[aria-pressed="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Zahlkonten', exact: true }).click()
  await page.getByRole('button', { name: 'Seitenleiste einklappen' }).click()
  expect(await page.evaluate(() => localStorage.getItem('sidebarCollapsed'))).toBe('true')
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  await expect(page.getByRole('button', { name: 'Zahlkonten', exact: true })).toHaveAttribute('aria-expanded', 'false')
})

test('uses only enabled modules and keeps settings visible with a scrollable list', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 480 })
  await page.evaluate(() => (window as any).renderSidebar({ minimal: true }))
  await expect(page.locator('.sidebar-accounts')).toHaveCount(0)
  await expect(page.locator('.nav-divider')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).requests)).toEqual([])
  await page.evaluate(() => (window as any).setModules(['Dashboard', 'Buchungen', 'Bankimport', 'Budgets', 'Reports', 'Einstellungen']))
  await expect(page.getByRole('button', { name: 'Mitglieder', exact: true })).toHaveCount(0)
  await expect(page.locator('.sidebar-account')).toHaveCount(3)
  const settings = await page.getByRole('button', { name: 'Einstellungen', exact: true }).boundingBox()
  expect(settings!.y + settings!.height).toBeLessThanOrEqual(480)
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('Einstellungen')
  await page.evaluate(() => (window as any).setModules(['Dashboard', 'Einstellungen']))
  await expect(page.locator('.sidebar-accounts')).toHaveCount(0)
})

test('narrow navigation overlays content, traps focus, and preserves desktop preference', async ({ page }, info) => {
  await page.setViewportSize({ width: 800, height: 700 })
  await page.evaluate(() => (window as any).renderSidebar())
  const mainBefore = await page.locator('main').boundingBox()
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
  expect(await page.locator('main').boundingBox()).toEqual(mainBefore)
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Seitenleiste einklappen' }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Version 4.11.0, Changelog anzeigen' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Seitenleiste einklappen' })).toBeFocused()
  await page.screenshot({ path: info.outputPath('sidebar-overlay.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('main')).not.toHaveAttribute('inert', '')
  expect(await page.evaluate(() => localStorage.getItem('sidebarCollapsed'))).toBe('false')
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  await page.getByRole('button', { name: 'Bankimport, 6 offen' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading')).toHaveText('Bankimport')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('button', { name: 'Seitenleiste einklappen' })).toBeVisible()
})

test('refreshes balances, prevents stale organization results, and offers retry without false zeroes', async ({ page }) => {
  await page.evaluate(() => (window as any).renderSidebar())
  await expect(page.locator('.sidebar-account')).toHaveCount(3)
  await page.evaluate(() => { (window as any).hold = true; window.dispatchEvent(new Event('data-changed:vouchers')) })
  await expect.poll(() => page.evaluate(() => (window as any).pending.length)).toBe(1)
  await page.evaluate(() => { (window as any).hold = false; (window as any).accounts = [{ id: 9, name: 'Neue Organisation', balance: 77, isActive: 1 }]; (window as any).switchOrg() })
  await expect(page.locator('.sidebar-account')).toHaveCount(1)
  await expect(page.locator('.sidebar-account')).toContainText('Neue Organisation')
  await page.evaluate(() => (window as any).pending[0]())
  await expect(page.locator('.sidebar-account')).toContainText('Neue Organisation')
  await page.evaluate(() => { (window as any).fail = true; window.dispatchEvent(new Event('data-changed:vouchers')) })
  await expect(page.getByText('Bestände nicht verfügbar.')).toBeVisible()
  await expect(page.locator('.sidebar-account')).toHaveCount(0)
  await page.evaluate(() => { (window as any).fail = false })
  await page.getByRole('button', { name: 'Erneut laden' }).click()
  await expect(page.locator('.sidebar-account')).toContainText('77,00')
})

test('shows the three newest active assignments, refreshes them and omits disabled or empty modules', async ({ page }, info) => {
  await page.evaluate(() => (window as any).renderSidebar({ assignments: true }))
  const budgets = page.getByRole('group', { name: 'Aktuelle Budgets' })
  const earmarks = page.getByRole('group', { name: 'Aktuelle Zweckbindungen' })
  await expect(budgets.getByRole('button')).toHaveText(['Jugend', 'Veranstaltungen', 'Verwaltung'])
  await expect(earmarks.getByRole('button')).toHaveText(['Spende Jugend', 'Projektförderung', 'Ausstattung'])
  await budgets.getByRole('button', { name: /Jugend/ }).click()
  expect(await page.evaluate(() => (window as any).assignmentSelection)).toEqual({ kind: 'budget', id: 5 })
  await earmarks.getByRole('button', { name: 'Projektförderung' }).click()
  expect(await page.evaluate(() => (window as any).assignmentSelection)).toEqual({ kind: 'earmark', id: 3 })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: info.outputPath('sidebar-recent-assignments.png') })
  await page.evaluate(() => { (window as any).budgets = []; window.dispatchEvent(new Event('data-changed:budgets')) })
  await expect(budgets).toHaveCount(0)
  await page.evaluate(() => (window as any).setModules(['Dashboard', 'Buchungen', 'Budgets', 'Einstellungen']))
  await expect(earmarks).toHaveCount(0)
  await page.evaluate(() => { (window as any).budgets = [{ id: 10, name: 'Neue Organisation', year: 2026 }]; (window as any).switchOrg() })
  await expect(budgets).toContainText('Neue Organisation')
})

test('animates expansion, keeps keyboard commands clear of settings and respects reduced motion', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('sidebarCollapsed', 'true'); (window as any).renderSidebar() })
  const root = page.locator('.app-root-grid')
  await expect(root).toHaveCSS('transition-duration', '0.24s')
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '260px')
  await expect(page.getByRole('button', { name: 'Tastaturbefehle anzeigen' })).toHaveCSS('left', '272px')
  const settings = await page.getByRole('button', { name: 'Einstellungen', exact: true }).boundingBox()
  const commands = await page.getByRole('button', { name: 'Tastaturbefehle anzeigen' }).boundingBox()
  expect(commands!.x).toBeGreaterThan(settings!.x + settings!.width)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(root).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('.nav-label').first()).toHaveCSS('animation-name', 'none')
  await page.setViewportSize({ width: 800, height: 700 })
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  await expect(page.locator('.leader-shortcut-trigger')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.leader-shortcut-trigger')).toBeVisible()
})

test('shows remaining plans and optional periods, marks binding dates and refreshes after bookings', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1150 })
  await page.evaluate(() => (window as any).renderSidebar({ assignments: true }))
  await expect(page.getByRole('group', { name: 'Aktuelle Budgets' })).toBeVisible()
  await page.evaluate(() => {
    const w = window as any
    Object.assign(w.budgets[1], { amountPlanned: 1000, startDate: '2026-01-01', endDate: '2026-12-31', enforceTimeRange: 1 })
    Object.assign(w.budgets[2], { amountPlanned: 200 })
    Object.assign(w.budgets[3], { endDate: '2026-12-31' })
    Object.assign(w.earmarks[1], { budget: 500, startDate: '2026-03-01' })
    w.budgetUsage = { 5: { inflow: 50, spent: 300 }, 4: { inflow: 0, spent: 250 } }
    w.earmarkUsage = { 4: { allocated: 100, released: 200 } }
    window.dispatchEvent(new Event('data-changed:vouchers'))
  })
  const budgets = page.getByRole('group', { name: 'Aktuelle Budgets' })
  const earmarks = page.getByRole('group', { name: 'Aktuelle Zweckbindungen' })
  const youth = budgets.getByRole('button', { name: /Jugend/ })
  await expect(youth).toContainText('750,00')
  await expect(youth).toContainText('01.01.2026 – 31.12.2026')
  await expect(youth.locator('svg[aria-label="Verbindlicher Zeitraum"]')).toHaveCount(1)
  await expect(budgets.locator('.sidebar-assignment-balance.is-negative')).toContainText('-50,00')
  const noPlan = budgets.getByRole('button', { name: /Verwaltung/ })
  await expect(noPlan.locator('.sidebar-assignment-balance')).toHaveCount(0)
  await expect(noPlan).toContainText('bis 31.12.2026')
  const donation = earmarks.getByRole('button', { name: /Spende Jugend/ })
  await expect(donation).toContainText('400,00')
  await expect(donation).toContainText('ab 01.03.2026')
  await expect(donation.locator('svg')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('sidebar-balances-periods.png'), animations: 'disabled' })
  await page.evaluate(() => { (window as any).budgetUsage[5] = { inflow: 0, spent: 1000 }; window.dispatchEvent(new Event('data-changed:vouchers')) })
  await expect(youth.locator('.sidebar-assignment-balance')).toHaveText('0,00 €')
  await page.evaluate(() => { (window as any).usageFailure = true; window.dispatchEvent(new Event('data-changed:vouchers')) })
  await expect(youth.locator('.sidebar-assignment-balance')).toHaveText('—')
  await expect(youth.locator('.sidebar-assignment-balance')).toHaveAttribute('aria-label', 'Reststand nicht verfügbar')
})

test('GENERAL organizations can enable and open earmarks', async ({ page }) => {
  await page.evaluate(() => (window as any).renderSidebar({ general: true, minimal: true, assignments: true }))
  await expect(page.getByRole('button', { name: 'Zweckbindungen', exact: true })).toHaveCount(0)
  await page.evaluate(() => (window as any).setModules(['Dashboard', 'Buchungen', 'Zweckbindungen', 'Mitglieder', 'Einstellungen']))
  await expect(page.getByRole('button', { name: 'Mitglieder', exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Aktuelle Zweckbindungen' }).getByRole('button')).toHaveCount(3)
  await page.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('Zweckbindungen')
})

test('updates the period lock immediately on budget and earmark changes', async ({ page }) => {
  await page.evaluate(() => (window as any).renderSidebar({ assignments: true }))
  const budgets = page.getByRole('group', { name: 'Aktuelle Budgets' })
  await expect(budgets).toBeVisible()
  await page.evaluate(() => { Object.assign((window as any).budgets[1], { startDate: '2026-01-01', endDate: '2026-12-31', enforceTimeRange: 1 }); window.dispatchEvent(new Event('data-changed:budgets')) })
  await expect(budgets.locator('svg[aria-label="Verbindlicher Zeitraum"]')).toHaveCount(1)
  await page.evaluate(() => { (window as any).budgets[1].enforceTimeRange = 0; window.dispatchEvent(new Event('data-changed:budgets')) })
  await expect(budgets.locator('svg[aria-label="Verbindlicher Zeitraum"]')).toHaveCount(0)
  await page.evaluate(() => { Object.assign((window as any).earmarks[1], { endDate: '2026-12-31', enforceTimeRange: 1 }); window.dispatchEvent(new Event('data-changed:earmarks')) })
  await expect(page.getByRole('group', { name: 'Aktuelle Zweckbindungen' }).locator('svg[aria-label="Verbindlicher Zeitraum"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Seitenleiste einklappen' })).toBeVisible()
})

test('shows import dates with due states per active non-cash account and updates after import', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00Z'))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.evaluate(() => {
    localStorage.setItem('sidebarCollapsed', 'true')
    const w = window as any
    w.renderSidebar({ bankImports: true })
    w.bankDates = { 2: '2026-11-07 12:00:00', 3: '2026-10-25 12:00:00', 4: '2026-10-24 12:00:00' }
    w.accounts.push({ id: 5, name: 'Altes Konto', kind: 'BANK', isActive: 0 }, { id: 6, name: 'Neues Konto', kind: 'BANK', isActive: 1 }, { id: 7, name: 'Ohne Erinnerung', kind: 'BANK', isActive: 1 })
    w.reminderSettings['dashboard.bankReminderDays.7'] = 0
  })
  expect(await page.evaluate(() => (window as any).bankImportCalls)).toBe(0)
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click()
  const imports = page.getByRole('group', { name: 'Letzte Bankimporte' })
  await expect(imports.getByRole('button')).toHaveCount(5)
  await expect(imports).not.toContainText('Kasse')
  await expect(imports).not.toContainText('Altes Konto')
  await expect(imports.locator('.sidebar-bank-import-state--current')).toHaveText('● Nicht fällig')
  await expect(imports.locator('.sidebar-bank-import-state--due')).toHaveCount(2)
  await expect(imports.locator('.sidebar-bank-import-state--overdue')).toHaveCount(1)
  await expect(imports.locator('.sidebar-bank-import-state--disabled')).toHaveCount(1)
  await expect(imports.getByRole('button', { name: /Geschäftskonto/ })).toContainText('7.11.2026')
  const bank = imports.getByRole('button', { name: /Geschäftskonto/ })
  await expect.poll(() => bank.evaluate(element => {
    const date = element.querySelector('.sidebar-bank-import-date')!.getBoundingClientRect()
    const badge = element.querySelector('.sidebar-bank-import-state')!.getBoundingClientRect()
    return Math.abs(date.y - badge.y) < 2 && badge.x >= date.right
  })).toBe(true)
  await page.screenshot({ path: info.outputPath('sidebar-bank-imports.png'), animations: 'disabled' })
  await imports.getByRole('button', { name: /Geschäftskonto/ }).click()
  expect(await page.evaluate(() => (window as any).bankSelection)).toBe(2)
  await page.evaluate(() => { (window as any).bankDates[4] = '2026-11-08 12:00:00'; window.dispatchEvent(new Event('data-changed:bank-imports')) })
  await expect(imports.locator('.sidebar-bank-import-state--overdue')).toHaveCount(0)
  await page.evaluate(() => { (window as any).reminderSettings['dashboard.bankReminderDays.3'] = 30; window.dispatchEvent(new Event('data-changed:settings')) })
  await expect(imports.getByRole('button', { name: /PayPal/ })).toContainText('Nicht fällig')
  await page.evaluate(() => { (window as any).bankStatusFails = true; window.dispatchEvent(new Event('data-changed:bank-imports')) })
  await expect(page.getByText('Importstand nicht verfügbar.')).toBeVisible()
  await expect(imports).toHaveCount(0)
  await page.evaluate(() => (window as any).setModules(['Dashboard', 'Buchungen', 'Einstellungen']))
  await expect(page.getByText('Importstand nicht verfügbar.')).toHaveCount(0)
})

test('keeps the sidebar scrollbar track transparent and shows the thumb only on hover', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 760 })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; (window as any).renderSidebar({ assignments: true, bankImports: true }) })
  const scroll = page.locator('.sidebar-nav-scroll')
  await expect(page.locator('.sidebar-bank-imports')).toBeVisible()
  await page.mouse.move(1000, 100)
  await expect(scroll).toHaveCSS('scrollbar-color', 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)')
  await scroll.hover({ position: { x: 235, y: 100 } })
  await expect(scroll).not.toHaveCSS('scrollbar-color', 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)')
  expect(await scroll.evaluate(element => getComputedStyle(element).scrollbarColor.endsWith('rgba(0, 0, 0, 0)'))).toBe(true)
  await page.screenshot({ path: info.outputPath('sidebar-hover-scrollbar-dark.png'), animations: 'disabled' })
  await page.mouse.move(1000, 100)
  await expect(scroll).toHaveCSS('scrollbar-color', 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)')
})


test('opens the changelog from the sidebar version', async ({ page }) => {
  await page.evaluate(() => (window as any).renderSidebar())
  await page.getByRole('button', { name: 'Version 4.11.0, Changelog anzeigen' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Changelog')
  await expect(dialog.locator('.changelog-entry').first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).first().click()
  await expect(dialog).toHaveCount(0)
})
