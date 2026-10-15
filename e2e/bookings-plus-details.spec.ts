import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script: string
let styles: string

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import BookingsPlusView from './src/renderer/views/BookingsPlus/BookingsPlusView'
      const budgets = [{ id: 1, label: 'Sommerfest' }, { id: 2, label: 'Jugendarbeit' }]
      const earmarks = [{ id: 3, code: 'SP', name: 'Spenden' }]
      let row = { id: 1, date: '2026-10-03', voucherNo: '2026-10-03_00090', type: 'OUT', sphere: 'IDEELL', grossAmount: 500, description: 'Material für das Sommerfest', paymentMethod: 'BAR', paymentAccountName: 'Testkasse', tags: ['Miete', 'Event'] }
      window.saved = []
      window.api = {
        ai: { invoiceBatch: { list: async () => ({ rows: [], counts: {} }), onChanged: () => () => {} } },
        reimbursements: { linkedVoucherIds: async () => [], list: async () => [] },
        classifications: { primary: { list: async () => ({ profile: 'VEREIN', values: [] }) } },
        organizations: { onSwitched: () => () => {} },
        vouchers: {
          list: async () => ({ rows: window.fixtureRows || [row], total: window.fixtureRows?.length || 1 }),
          updateMeta: async payload => {
            window.saved.push(payload)
            row = { ...row, ...payload, budgets: payload.budgets.map(item => ({ ...item, label: budgets.find(b => b.id === item.budgetId).label })), earmarksAssigned: payload.earmarks.map(item => ({ ...item, code: 'SP' })) }
          }
        },
        reports: { summary: async () => ({ byType: [{ key: 'OUT', gross: 500 }] }) }
      }
      function Harness() {
        const [calendar, setCalendar] = useState({ month: '2026-10', from: '', to: '' })
        return <BookingsPlusView onResetFilters={() => {}} calendarSelection={calendar} onCalendarSelectionChange={setCalendar} fmtDate={date => date} onNewBooking={() => {}} onEditBooking={() => {}} bookingEntryPresentation="flyout" onNewInvoice={() => {}} onReviewInvoice={() => {}} notify={() => {}} paymentAccounts={[]} budgets={budgets} earmarks={earmarks} tagDefs={[{ id: 1, name: 'Miete', color: '#3264ff' }, { id: 2, name: 'Event', color: '#008b96' }, { id: 3, name: 'Spende', color: '#a030ac' }]} allowVoucherDeletion={false} generalProfile={false} />
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    `
    },
    bundle: true,
    jsx: 'automatic',
    write: false,
    platform: 'browser',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'unrelated-widgets',
        setup(build) {
          build.onResolve(
            {
              filter:
                /\/(AttachmentsModal|ReceiptThumbnail|ReimbursementsDialog)$/
            },
            (args) => ({ path: args.path, namespace: 'widget-stub' })
          )
          build.onLoad({ filter: /.*/, namespace: 'widget-stub' }, () => ({
            contents: 'export default function Widget() { return null }',
            loader: 'js'
          }))
        }
      }
    ]
  })
  script = result.outputFiles[0].text
  styles = (
    await Promise.all(
      [
        'src/renderer/styles.css',
        'src/renderer/components/modals/voucherInfoActions.css',
        'src/renderer/components/booking/bookingTable.css',
        'src/renderer/views/BookingsPlus/bookingsPlus.css'
      ].map((file) => readFile(file, 'utf8'))
    )
  ).join('\n')
})

for (const theme of ['light', 'dark']) {
  test(`${theme}: compact details, assignment drafts and save`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.setContent(`<html data-theme="${theme}"><body><div id="root"></div></body></html>`)
    await page.addStyleTag({ content: styles })
    await page.addScriptTag({ content: script })
    const inspector = page.getByRole('complementary', { name: 'Ausgewählte Buchung' })
    await expect(inspector).toContainText('Material für das Sommerfest')
    await expect(inspector.locator('select, input, textarea')).toHaveCount(0)
    await inspector.screenshot({ path: info.outputPath(`details-${theme}.png`) })
    await page.screenshot({ path: info.outputPath(`workspace-${theme}.png`), fullPage: true })
    const assignmentsBefore = await inspector.getByRole('heading', { name: 'Zuordnungen' }).boundingBox()
    await inspector.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await expect(inspector.getByRole('button', { name: 'Budget zuordnen' })).toBeVisible()
    expect((await inspector.getByRole('heading', { name: 'Zuordnungen' }).boundingBox())!.y).toBeCloseTo(assignmentsBefore!.y, 0)
    await expect(page.getByRole('dialog', { name: 'Budget zuordnen' })).toHaveCount(0)
    await inspector.getByRole('button', { name: 'Budget zuordnen' }).click()
    const budget = page.getByRole('dialog', { name: 'Budget zuordnen' })
    await budget.getByRole('button', { name: 'Sommerfest', exact: true }).click()
    await budget.getByRole('spinbutton', { name: 'Betrag für Sommerfest' }).fill('300')
    await budget.getByRole('button', { name: 'Jugendarbeit', exact: true }).click()
    await expect(budget.getByRole('spinbutton', { name: 'Betrag für Jugendarbeit' })).toHaveValue(
      '200'
    )
    await page.screenshot({ path: info.outputPath(`assignment-${theme}.png`) })
    await page.keyboard.press('Escape')
    await expect(budget).toHaveCount(0)
    await inspector.getByRole('button', { name: 'Zweckbindung zuordnen' }).click()
    await page
      .getByRole('dialog', { name: 'Zweckbindung zuordnen' })
      .getByRole('button', { name: 'SP · Spenden' })
      .click()
    await page.keyboard.press('Escape')
    await inspector.getByRole('button', { name: 'Tags bearbeiten' }).click()
    await page.getByRole('button', { name: 'Tag Spende hinzufügen', exact: true }).click()
    await page.keyboard.press('Escape')
    await inspector.getByRole('textbox', { name: 'Notiz', exact: true }).fill('Quittung folgt.')
    await inspector.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(inspector).toContainText('Quittung folgt.')
    await expect(inspector.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeVisible()
    expect(await page.evaluate(() => (window as any).saved)).toEqual([
      {
        id: 1,
        note: 'Quittung folgt.',
        budgets: [
          { budgetId: 1, amount: 300 },
          { budgetId: 2, amount: 200 }
        ],
        earmarks: [{ earmarkId: 3, amount: 500 }],
        tags: ['Miete', 'Event', 'Spende']
      }
    ])
    await inspector.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await inspector.getByRole('textbox', { name: 'Notiz', exact: true }).fill('Verwerfen')
    await inspector.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(inspector).toContainText('Quittung folgt.')
    await expect(inspector).not.toContainText('Verwerfen')
    expect(errors).toEqual([])
  })
}

test('narrow inspector keeps draft when Escape closes dropdown and rejects excess amounts', async ({
  page
}, info) => {
  await page.setViewportSize({ width: 390, height: 740 })
  await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  await page.locator('.bp-row').click()
  const inspector = page.getByRole('dialog', { name: 'Ausgewählte Buchung' })
  await inspector.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await expect(page.getByRole('button', { name: 'Ähnliche Buchungen' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(inspector).toBeVisible()
  await inspector.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await inspector.getByRole('button', { name: 'Budget zuordnen' }).click()
  const budget = page.getByRole('dialog', { name: 'Budget zuordnen' })
  await budget.getByRole('button', { name: 'Sommerfest', exact: true }).click()
  await budget.getByRole('spinbutton', { name: 'Betrag für Sommerfest' }).fill('501')
  await page.screenshot({ path: info.outputPath('narrow-assignment.png') })
  const bounds = await budget.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.keyboard.press('Escape')
  await expect(inspector).toBeVisible()
  await expect(inspector.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled()
  await expect(inspector.getByRole('alert')).toContainText('Budget-Summe')
  await inspector.getByRole('button', { name: 'Budget zuordnen' }).click()
  await budget.getByRole('button', { name: 'Budget Sommerfest entfernen' }).click()
  await page.keyboard.press('Escape')
  await expect(inspector.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled()
  await inspector.getByRole('button', { name: 'Abbrechen' }).click()
  expect(await page.evaluate(() => (window as any).saved)).toEqual([])
})


test('portrait details follow the selected row and keep actions close to their content', async ({ page }, info) => {
  await page.setViewportSize({ width: 1080, height: 1920 })
  await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>')
  await page.evaluate(() => {
    (window as any).fixtureRows = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1, date: '2026-10-03', voucherNo: `2026-10-03_${index}`,
      type: 'IN', sphere: 'IDEELL', grossAmount: 250,
      description: `Buchung ${index + 1}`, paymentAccountName: 'Testkasse', tags: ['Event']
    }))
  })
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  const inspector = page.getByRole('dialog', { name: 'Ausgewählte Buchung' })
  for (const index of [0, 12]) {
    const row = page.locator('.bp-row').nth(index)
    await row.click()
    await expect(inspector).toBeVisible()
    const rowBounds = (await row.boundingBox())!
    const bounds = (await inspector.boundingBox())!
    expect(bounds.height).toBeLessThan(800)
    expect(bounds.y).toBeGreaterThanOrEqual(8)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1912)
    if (index === 0) expect(bounds.y).toBeCloseTo(rowBounds.y, 0)
    else expect(bounds.y + bounds.height).toBeCloseTo(rowBounds.y + rowBounds.height, 0)
    const body = (await inspector.locator('.bp-inspector-scroll').boundingBox())!
    const actions = (await inspector.getByRole('button', { name: 'Bearbeiten', exact: true }).boundingBox())!
    expect(actions.y - body.y - body.height).toBeLessThanOrEqual(20)
    await page.screenshot({ path: info.outputPath(`portrait-details-${index}.png`) })
    await page.keyboard.press('Escape')
    await expect(row).toBeFocused()
  }
  await page.locator('.bp-row').first().focus()
  await page.keyboard.press('Enter')
  await expect(inspector).toBeVisible()
  await inspector.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(inspector.getByRole('button', { name: 'Speichern', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 480, height: 560 })
  await expect.poll(async () => {
    const bounds = (await inspector.boundingBox())!
    return bounds.y >= 8 && bounds.y + bounds.height <= 552
  }).toBe(true)
  await expect(inspector.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport()
  await inspector.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(inspector.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeInViewport()
})

test('calendar and filters open without moving the list at desktop and mobile widths', async ({ page }, info) => {
  await page.setContent('<html data-theme="light"><body><div id="root"></div></body></html>')
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script })
  for (const width of [1600, 900, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const list = page.locator('.bp-list')
    const before = await list.boundingBox()
    await expect(page.locator('.bp-calendar')).toHaveCount(0)
    await expect(page.locator('.bp-filters')).toHaveCount(0)
    await page.getByRole('button', { name: 'Kalender öffnen', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Kalender öffnen', exact: true })).toBeVisible()
    expect(await list.boundingBox()).toEqual(before)
    await page.screenshot({ path: info.outputPath(`calendar-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Buchungsfilter', exact: true }).click()
    const filters = page.getByRole('dialog', { name: 'Buchungsfilter', exact: true })
    if (!(await filters.locator('details').evaluate(element => (element as HTMLDetailsElement).open))) await filters.locator('summary').click()
    await expect(filters.getByLabel('Von', { exact: true })).toBeVisible()
    const bounds = await filters.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
    expect(await list.boundingBox()).toEqual(before)
    await page.screenshot({ path: info.outputPath(`filters-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    expect(await page.locator('.bookings-plus').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`workspace-${width}.png`), fullPage: true })
  }
})

