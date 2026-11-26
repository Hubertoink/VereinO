import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/views/AI/AIView.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { AiHistoryDrawer } from './src/renderer/views/AI/AiHistoryDrawer'
    const jobs = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1, type: 'AGENT_CHAT', status: 'APPROVED',
      title: 'Aufgabe ' + (index + 1), createdAt: index < 2 ? '2026-10-03' : '2026-10-02', result: null
    }))
    const booked = jobs.slice(0, 12).map(job => ({ ...job, type: 'BOOKING_FROM_DOCUMENTS', title: 'Gebucht ' + job.id, voucherId: job.id }))
    const open = window.withReviews ? [{ ...booked[0], status: 'REVIEW', title: 'Offener Vorschlag' }] : []
    createRoot(document.getElementById('root')).render(<div className="ai-page">
      <AiHistoryDrawer jobs={jobs} openBookingJobs={open} completedBookingJobs={booked} busy={false}
        onClose={() => { window.closedHistory = true }} onOpenJob={id => { window.openedJob = id }} onMarkDone={job => { window.resolved = job.id }} onDelete={job => { window.deleted = job.id }} />
    </div>)
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
})

for (const viewport of [{ width: 1280, height: 550 }, { width: 640, height: 480 }, { width: 375, height: 560 }]) {
  test(`AI history stays within a ${viewport.width}×${viewport.height} window and all jobs remain reachable`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.setContent('<html data-theme="light" data-color-theme="soft-blush"><div id="root"></div></html>')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    const drawer = page.getByRole('dialog', { name: 'KI-Verlauf' })
    const bounds = await drawer.boundingBox()
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 12)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    const header = await drawer.locator('header').boundingBox()
    const nav = await drawer.getByRole('navigation').boundingBox()
    const scrollport = await drawer.locator('.ai-history-list').boundingBox()
    expect(header!.x).toBeCloseTo(bounds!.x + 1, 0)
    expect(header!.y).toBeCloseTo(bounds!.y + 1, 0)
    expect(header!.width).toBeCloseTo(bounds!.width - 2, 0)
    expect(nav!.x).toBeCloseTo(bounds!.x + 1, 0)
    expect(nav!.y).toBeCloseTo(header!.y + header!.height, 0)
    if (viewport.width > 520) {
      expect(nav!.y + nav!.height).toBeCloseTo(bounds!.y + bounds!.height - 1, 0)
    }
    expect(scrollport!.y + scrollport!.height).toBeCloseTo(bounds!.y + bounds!.height - 1, 0)
    expect(scrollport!.x + scrollport!.width).toBeCloseTo(bounds!.x + bounds!.width - 1, 0)
    const last = drawer.getByRole('button', { name: /^Aufgabe 40/ })
    await expect(drawer.getByRole('heading', { name: '3. Oktober 2026' })).toHaveCount(1)
    const list = drawer.locator('.ai-history-list')
    await list.evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(last).toBeInViewport()
    const lastBounds = await last.boundingBox()
    expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height)
    await drawer.getByRole('button', { name: 'Offene Buchungsreviews 0' }).click()
    await expect(drawer.getByText('Keine offenen Buchungsvorschläge.')).toBeVisible()
    await drawer.getByRole('button', { name: 'Gebuchte Vorschläge 12' }).click()
    await expect(drawer.getByRole('button', { name: /^Gebucht 12 / })).toContainText('Buchung #12')
    await drawer.getByRole('button', { name: /^Gebucht 12 / }).click()
    expect(await page.evaluate(() => [(window as any).openedJob, (window as any).closedHistory])).toEqual([12, true])
    await drawer.getByRole('button', { name: 'Alle KI-Aufgaben 40' }).click()
    await page.screenshot({ path: info.outputPath('ai-history.png') })
  })
}

test('open booking reviews expose their actions without opening the job', async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.evaluate(() => { (window as any).withReviews = true })
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await page.getByRole('button', { name: 'Offene Buchungsreviews 1' }).click()
  await page.getByRole('button', { name: 'Buchungsreview als erledigt markieren' }).click()
  await page.getByRole('button', { name: 'Buchungsreview löschen' }).click()
  expect(await page.evaluate(() => {
    const state = window as any
    return [state.resolved, state.deleted, Boolean(state.openedJob), Boolean(state.closedHistory)]
  })).toEqual([1, 1, false, false])
})
