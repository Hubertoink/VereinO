import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/views/AI/AIView.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { AiHistoryDrawer } from './src/renderer/views/AI/AiHistoryDrawer'
    const jobs = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1, type: 'AGENT_CHAT', status: 'APPROVED',
      title: 'Aufgabe ' + (index + 1), createdAt: '2026-10-02', result: null
    }))
    const booked = jobs.slice(0, 6).map(job => ({ ...job, type: 'BOOKING_FROM_DOCUMENTS', title: 'Gebucht ' + job.id, voucherId: job.id }))
    createRoot(document.getElementById('root')).render(<div className="ai-page">
      <AiHistoryDrawer jobs={jobs} openBookingJobs={[]} completedBookingJobs={booked} busy={false}
        onClose={() => {}} onOpenJob={() => {}} onMarkDone={() => {}} onDelete={() => {}} />
    </div>)
  ` }, bundle: true, jsx: 'automatic', write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
})

for (const viewport of [{ width: 1280, height: 550 }, { width: 640, height: 480 }]) {
  test(`AI history stays within a ${viewport.width}×${viewport.height} window and all jobs remain reachable`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.setContent('<html data-theme="light" data-color-theme="soft-blush"><div id="root"></div></html>')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    const drawer = page.getByRole('dialog', { name: 'KI-Verlauf' })
    const bounds = await drawer.boundingBox()
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 12)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    const last = drawer.getByRole('button', { name: /^Aufgabe 40/ })
    const list = page.locator('.ai-history-group--all .ai-history-list')
    if (viewport.width <= 760) {
      await drawer.hover({ position: { x: 12, y: 150 } })
      await page.mouse.wheel(0, 2000)
    }
    await list.evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(last).toBeInViewport()
    const lastBounds = await last.boundingBox()
    expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height)
    await page.screenshot({ path: info.outputPath('ai-history.png') })
  })
}
