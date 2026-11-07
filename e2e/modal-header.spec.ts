import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string

test.beforeAll(async () => {
  css = (await Promise.all([
    'src/renderer/styles.css', 'src/renderer/components/compactBookingFlyout.css',
    'src/renderer/components/common/party.css', 'src/renderer/components/modalHeader.css'
  ].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import ModalHeader from './src/renderer/components/ModalHeader'
      import BookingPopupFrame from './src/renderer/components/modals/BookingPopupFrame'
      import { PartyEditorModal } from './src/renderer/components/common/PartySelector'
      const root = createRoot(document.getElementById('root'))
      const longBody = <div style={{padding: 14}}>{Array.from({length: 40}, (_, i) => <p key={i}>Zeile {i + 1}: Formularinhalt zum Prüfen des Scrollbereichs.</p>)}</div>
      function Harness({kind, disabled = false}) {
        const [nested, setNested] = React.useState(false)
        const close = () => { window.headerCloseCalls = (window.headerCloseCalls || 0) + 1 }
        if (kind === 'party') return <PartyEditorModal initial={{name: 'OBI GmbH', iban: 'DE12500105170648489890'}} onClose={close} onSaved={() => {}} />
        if (kind === 'recurring') return <BookingPopupFrame variant="compact" anchorToTrigger={false} title="+ Dauerbuchung" subtitle="Vorlage für regelmäßig fällige Buchungen" onClose={close}><div style={{overflowY: 'auto'}}>{longBody}</div></BookingPopupFrame>
        return <div className="modal-overlay" role="dialog"><form className="modal" onSubmit={event => {event.preventDefault(); window.submitted = true}}>
          <ModalHeader title="Buchungsentwurf prüfen" subtitle="Importierte Originaldaten vergleichen" onClose={close} closeDisabled={disabled} actions={<button type="button" onClick={() => setNested(true)}>Details öffnen</button>} />
          {longBody}
          {nested && <div className="modal-overlay" role="dialog"><div className="modal"><ModalHeader title="Details" onClose={() => setNested(false)} /><p>Unterdialog</p></div></div>}
        </form></div>
      }
      window.renderHeaderTest = (kind, disabled) => { window.headerCloseCalls = 0; window.submitted = false; root.render(<Harness key={kind + disabled} kind={kind} disabled={disabled} />) }
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://header.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://header.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' })
  await page.addScriptTag({ content: script })
})

test('shared close control has the recurring-dialog style across themes and widths; headers stay visible', async ({ page }, testInfo) => {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1280, 600]) {
      await page.setViewportSize({ width, height: 740 })
      for (const kind of ['recurring', 'legacy', 'party']) {
        await page.evaluate(kind => (window as any).renderHeaderTest(kind), kind)
        const close = page.getByRole('button', { name: 'Schließen', exact: true })
        await expect(close).toBeVisible()
        expect(await close.evaluate(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
          return { width: rect.width, height: rect.height, color: style.color, background: style.backgroundColor, svg: element.querySelector('svg')?.getAttribute('width') }
        })).toMatchObject({ width: 34, height: 32, svg: '16' })
        const header = page.locator('.modal-header-bar')
        await header.evaluate(element => {
          const modal = element.closest('.modal')!
          for (const node of [modal, ...modal.querySelectorAll<HTMLElement>('div, form')]) {
            if (node.scrollHeight > node.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(node).overflowY)) node.scrollTop = node.scrollHeight
          }
        })
        await expect(close).toBeInViewport()
        expect(await close.evaluate(element => {
          const box = element.getBoundingClientRect()
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
        })).toBe(true)
        if (theme === 'light' && width === 600) await page.screenshot({ path: testInfo.outputPath(`${kind}-header.png`) })
      }
    }
  }
})

test('disabled close, keyboard close and nested dialogs preserve their actions without submitting forms', async ({ page }) => {
  await page.evaluate(() => (window as any).renderHeaderTest('legacy', true))
  await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => (window as any).headerCloseCalls)).toBe(0)
  await page.evaluate(() => (window as any).renderHeaderTest('legacy', false))
  await page.getByRole('button', { name: 'Details öffnen' }).click()
  await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Details', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).headerCloseCalls)).toBe(0)
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  expect(await page.evaluate(() => (window as any).headerCloseCalls)).toBe(1)
  expect(await page.evaluate(() => (window as any).submitted)).toBe(false)
})
