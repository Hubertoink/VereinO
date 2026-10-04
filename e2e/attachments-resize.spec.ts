import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let script: string
let css: string

test.beforeAll(async () => {
  css = await readFile('src/renderer/styles.css', 'utf8')
  script = (await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx', contents: `
        import React, { useState } from 'react'
        import { createRoot } from 'react-dom/client'
        import AttachmentsModal from './src/renderer/components/modals/AttachmentsModal'
        window.api = {
          vouchers: { list: async () => ({ rows: [{ id: 1, type: 'OUT', sphere: 'IDEELL', grossAmount: 118.75, paymentMethod: 'BANK' }] }) },
          attachments: { list: async () => ({ files: [] }) }
        }
        function App() {
          const [open, setOpen] = useState(true)
          return open && <AttachmentsModal voucher={{ voucherId: 1, voucherNo: 'OUT-1', date: '2026-10-03', description: 'Resize prüfen' }} onClose={() => setOpen(false)} />
        }
        createRoot(document.getElementById('root')).render(<App />)
      `
    },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    loader: { '.css': 'empty' },
    external: ['pdfjs-dist/legacy/build/pdf'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'attachment-fixtures', setup(builder) {
      builder.onResolve({ filter: /pdf\.worker/ }, args => ({ path: args.path, namespace: 'worker' }))
      builder.onLoad({ filter: /.*/, namespace: 'worker' }, () => ({ contents: 'export default "unused-worker"', loader: 'js' }))
      builder.onResolve({ filter: /\/context\/useToast$/ }, args => ({ path: args.path, namespace: 'toast' }))
      builder.onLoad({ filter: /.*/, namespace: 'toast' }, () => ({ contents: 'export const useToast = () => ({ notify: () => {} })', loader: 'js' }))
    } }]
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.setContent('<html data-theme="light"><div id="root"></div></html>')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.attachments-modal__content')).toBeVisible()
  await page.locator('.attachments-modal').evaluate(el => el.getAnimations().forEach(animation => animation.finish()))
})

async function checkResizeRelease(page: Page) {
  const modal = page.locator('.attachments-modal')
  const before = (await modal.boundingBox())!
  await page.getByRole('button', { name: 'Belegfenstergröße ändern' }).hover()
  await page.mouse.down()
  await page.mouse.move(before.x + before.width + 197, before.y + before.height + 117, { steps: 10 })
  await page.mouse.up()
  await expect(modal).toBeVisible()
  expect((await modal.boundingBox())!.width).toBeGreaterThan(before.width + 100)
  // A trailing click must not close the dialog even if it targets the backdrop.
  await page.locator('.attachments-modal-overlay').dispatchEvent('click')
  await expect(modal).toBeVisible()
  const enlarged = (await modal.boundingBox())!
  await page.getByRole('button', { name: 'Belegfenstergröße ändern' }).hover()
  await page.mouse.down()
  await page.mouse.move(enlarged.x + enlarged.width - 210, enlarged.y + enlarged.height - 130, { steps: 10 })
  await page.mouse.up()
  await expect(modal).toBeVisible()
  expect((await modal.boundingBox())!.width).toBeLessThan(enlarged.width - 100)
  await page.mouse.click(20, 20)
  await expect(modal).toHaveCount(0)
}

test('resizing stays open when release produces a backdrop click', async ({ page }) => {
  await checkResizeRelease(page)
})

test('resize release stays open in the installed Electron renderer', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vereino-attachment-resize-'))
  const main = path.join(dir, 'main.cjs')
  await writeFile(main, `
    const { app, BrowserWindow } = require('electron')
    app.whenReady().then(() => {
      const window = new BrowserWindow({ width: 1600, height: 1000, show: false })
      window.loadURL('data:text/html,<html data-theme="light"><div id="root"></div></html>')
    })
    app.on('window-all-closed', () => app.quit())
  `)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [main], env })
  try {
    const page = await app.firstWindow()
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    await expect(page.locator('.attachments-modal__content')).toBeVisible()
    await page.locator('.attachments-modal').evaluate(el => el.getAnimations().forEach(animation => animation.finish()))
    await checkResizeRelease(page)
  } finally {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('resize handle supports the keyboard', async ({ page }) => {
  const modal = page.locator('.attachments-modal')
  const before = (await modal.boundingBox())!
  const handle = page.getByRole('button', { name: 'Belegfenstergröße ändern' })
  await handle.focus()
  await handle.press('ArrowRight')
  await handle.press('ArrowDown')
  const after = (await modal.boundingBox())!
  expect(after.width).toBe(before.width + 20)
  expect(after.height).toBe(before.height + 20)
  await expect(modal).toBeVisible()
})

test('pressing inside and releasing outside keeps the modal open', async ({ page }) => {
  await page.locator('.attachments-modal__title h2').hover()
  await page.mouse.down()
  await page.mouse.move(20, 20)
  await page.mouse.up()
  await expect(page.locator('.attachments-modal')).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.locator('.attachments-modal')).toHaveCount(0)
})

test('Escape still closes the modal', async ({ page }) => {
  await page.keyboard.press('Escape')
  await expect(page.locator('.attachments-modal')).toHaveCount(0)
})
