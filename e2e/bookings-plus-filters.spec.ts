import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let styles: string

test('compact rows and removable filter chips retain the detail inspector', async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.setContent('<style>:root { --surface:#fff;--text:#202532;--text-dim:#667085;--border:#d7dce5;--accent:#426bd9 }body{font-family:Arial;background:#f4f6fa;color:#202532}</style><div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await expect(page.locator('.bookings-plus')).toHaveClass(/bookings-plus--dense/)
  await expect(page.getByRole('group', { name: 'Zeilenabstand' })).toHaveCount(0)
  await expect(page.locator('.booking-open-details')).toHaveCount(0)
  await page.locator('.bp-row').filter({ hasText: 'Einnahme Test' }).click()
  await expect(page.getByRole('complementary', { name: 'Ausgewählte Buchung' })).toContainText('Einnahme Test')
  await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Einnahme: Filter entfernen' })).toBeVisible()
  await page.evaluate(() => (window as any).pendingFilters.splice(0).forEach((resolve: () => void) => resolve()))
  await expect(page.locator('.bp-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Einnahme: Filter entfernen' }).click()
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('bookings-plus-compact.png'), fullPage: true })
})

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import BookingsPlusView from './src/renderer/views/BookingsPlus/BookingsPlusView'
      const rows = [
        { id: 1, date: '2026-09-09', voucherNo: 'IN-1', type: 'IN', sphere: 'IDEELL', grossAmount: 350, description: 'Einnahme Test', counterparty: 'Ikea', tags: [] },
        { id: 2, date: '2026-09-08', voucherNo: 'OUT-2', type: 'OUT', sphere: 'IDEELL', grossAmount: 100, description: 'Ausgabe Test', tags: [] }
      ]
      window.pendingFilters = []
      window.editCalls = []
      window.detachedCalls = []
      window.api = {
        reimbursements: { linkedVoucherIds: async () => [2] },
        organizations: { onSwitched: () => () => {} },
        quickAdd: { openDetached: async payload => { window.detachedCalls.push(payload); return { ok: true } } },
        vouchers: { list: async (filter) => {
          const selected = rows.filter(row => (!filter.q || row.voucherNo.includes(filter.q)) && (!filter.type || row.type === filter.type) && (!filter.from || row.date >= filter.from) && (!filter.to || row.date <= filter.to))
          if (filter.limit === 20 && filter.type) await new Promise(resolve => window.pendingFilters.push(resolve))
          return { rows: selected, total: selected.length }
        }},
        reports: { summary: async filter => ({ byType: filter.type ? [{ key: filter.type, gross: filter.type === 'IN' ? 350 : 100 }] : [{ key: 'IN', gross: 350 }, { key: 'OUT', gross: 100 }] }) }
      }
      function Harness() {
        const [visible, setVisible] = useState(true)
        const [externalFilters, setExternalFilters] = useState({})
        const [jumpRevision, setJumpRevision] = useState(0)
        window.jumpTo = q => { setExternalFilters({ q }); setJumpRevision(value => value + 1) }
        const [drafts, setDrafts] = useState([])
        window.setDrafts = setDrafts
        const [calendarSelection, setCalendarSelection] = useState({ month: '2026-09', from: '', to: '' })
        return <>
          <button id="navigate" onClick={() => setVisible(value => !value)}>{visible ? 'Weg' : 'Zurück'}</button>
          {visible && <BookingsPlusView showBookingDraftTabs bookingDraftTabs={drafts} onOpenBookingDraft={id => { window.openedDraft = id; setDrafts(current => current.map(draft => ({ ...draft, isActive: draft.id === id }))) }} onCloseBookingDraft={id => setDrafts(current => current.filter(draft => draft.id !== id))} externalFilters={externalFilters} jumpRevision={jumpRevision} onFilterChange={(key, value) => setExternalFilters(current => ({ ...current, [key]: value }))} onResetFilters={() => setExternalFilters({})} calendarSelection={calendarSelection} onCalendarSelectionChange={setCalendarSelection} fmtDate={date => date} onNewBooking={() => {}} onEditBooking={row => { window.editCalls.push(row.id) }} bookingEntryPresentation="flyout" onNewInvoice={() => {}} onReviewInvoice={() => {}} notify={() => {}} paymentAccounts={[]} budgets={[]} earmarks={[]} tagDefs={[]} allowVoucherDeletion={true} generalProfile={false} />}
        </>
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'unrelated-widgets', setup(build) {
      build.onResolve({ filter: /\/(AttachmentsModal|VoucherInfoModal|InvoiceBatchControl|ReceiptThumbnail|DateFilterInput|RecentBookingsDropdown)$/ }, args => ({ path: args.path, namespace: 'widget-stub' }))
      build.onLoad({ filter: /.*/, namespace: 'widget-stub' }, () => ({ contents: 'export default function Widget() { return null }', loader: 'js' }))
    }}]
  })
  script = result.outputFiles[0].text
  styles = (await Promise.all(['src/renderer/views/BookingsPlus/bookingsPlus.css', 'src/renderer/components/booking/bookingTable.css'].map(file => readFile(file, 'utf8')))).join('\n')
  const sharedStyles = await readFile('src/renderer/styles.css', 'utf8')
  styles = sharedStyles.slice(sharedStyles.indexOf('.booking-draft-tabs {'), sharedStyles.indexOf('.booking-close-guard-modal {')) + '\n' + styles
})

test('filter refresh keeps rows, totals and panel geometry until results arrive', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.setContent('<style>:root { --surface:#202532;--text:#fff;--border:#444;--accent:#82baff }body{color:white;background:#111}</style><div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.bp-row')).toHaveCount(2)
  const panel = page.locator('.bp-list')
  const before = await panel.boundingBox()
  const sum = await page.locator('.bp-totals').innerText()
  await page.getByRole('button', { name: 'Einnahme', exact: true }).click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await expect(page.locator('.bp-row').first()).toBeDisabled()
  await expect(page.locator('.bp-totals')).toHaveText(sum, { useInnerText: true })
  const during = await panel.boundingBox()
  expect(during!.height).toBeCloseTo(before!.height, 0)
  expect(during!.y).toBeCloseTo(before!.y, 0)
  await page.evaluate(() => (window as any).pendingFilters.splice(0).forEach((resolve: () => void) => resolve()))
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.bp-row')).toHaveCount(1)
  await expect(page.locator('.bp-row')).toContainText('Einnahme Test')
  await expect(page.locator('.bp-row')).toBeEnabled()
})

test('selected day and month survive leaving Buchungen Plus', async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await expect(page.locator('.bp-row').filter({ hasText: 'Ausgabe Test' }).getByRole('img', { name: 'Kostenerstattung verknüpft' })).toBeVisible()
  await expect(page.locator('.bp-row').filter({ hasText: 'Einnahme Test' }).getByRole('img', { name: 'Kostenerstattung verknüpft' })).toHaveCount(0)
  await page.getByRole('button', { name: /09\. Sept\. 2026/ }).click()
  await expect(page.locator('.bp-row')).toHaveCount(1)
  await page.locator('#navigate').click()
  await page.locator('#navigate').click()
  await expect(page.getByRole('button', { name: /09\. Sept\. 2026/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.bp-row')).toHaveCount(1)
  await page.getByRole('button', { name: /September 2026/i }).click()
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await page.locator('#navigate').click()
  await page.locator('#navigate').click()
  await expect(page.getByRole('button', { name: /September 2026/i })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Gesamter Verlauf' }).click()
  await page.locator('#navigate').click()
  await page.locator('#navigate').click()
  await expect(page.getByRole('button', { name: 'Gesamter Verlauf' })).toHaveAttribute('aria-pressed', 'true')
})

test('edit in flyout mode does not open a detached window', async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: script })
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).editCalls)).toEqual([1])
  expect(await page.evaluate(() => (window as any).detachedCalls)).toEqual([])
})


test('narrow rows show payment and reimbursement indicators alongside tags', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await page.setContent('<div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  const row = page.locator('.bp-row').filter({ hasText: 'Ausgabe Test' })
  await expect(row.locator('.bp-row-tags .bp-payment-badge')).toBeVisible()
  await expect(row.getByRole('img', { name: 'Kostenerstattung verknüpft' })).toBeVisible()
  await expect(row.locator(':scope > .bp-row-payment')).toBeHidden()
})


test('draft tabs stay beside search without moving the booking list', async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.setContent('<style>body{font-family:Arial} :root{--surface:white;--text:#222;--text-dim:#777;--border:#ddd;--accent:#426bd9;--success:green}</style><div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.bp-row')).toHaveCount(2)
  const before = await page.locator('.bp-list').boundingBox()
  await page.evaluate(() => (window as any).setDrafts(Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: '#' + i + ' Sehr lange Buchungsbeschreibung für einen Entwurf', title: 'Vollständige Beschreibung ' + i, type: 'IN', isActive: i === 11 }))))
  const tabs = page.locator('.bp-draft-tabs')
  await expect(tabs.locator('.booking-draft-tab')).toHaveCount(12)
  const searchBox = await page.getByRole('searchbox', { name: 'Buchungen suchen' }).boundingBox()
  const tabBox = await tabs.boundingBox()
  expect(tabBox!.x).toBeGreaterThan(searchBox!.x + searchBox!.width)
  expect(Math.abs(tabBox!.y - searchBox!.y)).toBeLessThan(8)
  expect((await page.locator('.bp-list').boundingBox())!.y).toBe(before!.y)
  expect(await tabs.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(await tabs.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await expect(tabs.locator('.booking-draft-tab__open').last()).toHaveAttribute('title', 'Vollständige Beschreibung 11')
  await tabs.locator('.booking-draft-tab__close').last().click()
  await expect(tabs.locator('.booking-draft-tab')).toHaveCount(11)
  await page.screenshot({ path: info.outputPath('bookings-tabs-inline.png'), fullPage: true })
  await page.setViewportSize({ width: 600, height: 900 })
  const narrowBefore = (await page.locator('.bp-list').boundingBox())!.y
  await page.evaluate(() => (window as any).setDrafts([]))
  await expect(tabs).toHaveCount(0)
  expect((await page.locator('.bp-list').boundingBox())!.y).toBe(narrowBefore)
})


test('cleared linked-booking search stays cleared after navigation and new jumps still apply', async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await page.evaluate(() => (window as any).jumpTo('OUT-2'))
  await expect(page.locator('.bp-row')).toHaveCount(1)
  await expect(page.getByRole('searchbox', { name: 'Buchungen suchen' })).toHaveValue('OUT-2')
  await page.getByRole('button', { name: /Suche: OUT-2: Filter entfernen/ }).click()
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await page.locator('#navigate').click()
  await page.locator('#navigate').click()
  await expect(page.getByRole('searchbox', { name: 'Buchungen suchen' })).toHaveValue('')
  await expect(page.locator('.bp-row')).toHaveCount(2)
  await page.evaluate(() => (window as any).jumpTo('IN-1'))
  await expect(page.getByRole('searchbox', { name: 'Buchungen suchen' })).toHaveValue('IN-1')
  await expect(page.locator('.bp-row')).toHaveCount(1)
})
