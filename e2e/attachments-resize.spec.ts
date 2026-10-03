import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

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

test('resizing stays open when release produces a backdrop click', async ({ page }) => {
  const modal = page.locator('.attachments-modal')
  const before = (await modal.boundingBox())!
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width + 197, before.y + before.height + 117, { steps: 10 })
  await page.mouse.up()
  await expect(modal).toBeVisible()
  expect((await modal.boundingBox())!.width).toBeGreaterThan(before.width + 100)
  // Chromium can target the backdrop when a native resize ends beyond the
  // recentered modal. Reproduce that final click even on platforms that omit it.
  await page.locator('.attachments-modal-overlay').dispatchEvent('click')
  await expect(modal).toBeVisible()
  await page.mouse.click(20, 20)
  await expect(modal).toHaveCount(0)
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
