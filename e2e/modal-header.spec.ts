import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'

let script: string
let css: string
let insetLayouts: string[]

test.beforeAll(async () => {
  // Exercise every opted-in layout using the classes from the actual dialogs.
  const sources = await fs.readdir('src/renderer', { recursive: true })
  insetLayouts = [...new Set((await Promise.all(sources.filter(file => file.endsWith('.tsx')).map(file =>
    fs.readFile(path.join('src/renderer', file), 'utf8')
  ))).flatMap(source => [...source.matchAll(/className="([^"]*\bmodal-inset-header\b[^"]*)"/g)].map(match => match[1])))]
  css = (await Promise.all([
    'src/renderer/styles.css', 'src/renderer/components/compactBookingFlyout.css',
    'src/renderer/components/common/party.css', 'src/renderer/views/BankImport/bankImportRemap.css',
    'src/renderer/views/BankImport/bankAiReviewProgress.css', 'src/renderer/components/modalHeader.css'
  ].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({ jsx: 'automatic',
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import ModalHeader from './src/renderer/components/ModalHeader'
      import BookingPopupFrame from './src/renderer/components/modals/BookingPopupFrame'
      import { PartyEditorModal } from './src/renderer/components/common/PartySelector'
      import { ChangelogModal } from './src/renderer/components/modals/ChangelogModal'
      import UpdateAvailableModal from './src/renderer/components/modals/UpdateAvailableModal'
      const root = createRoot(document.getElementById('root'))
      const longBody = <div style={{padding: 14}}>{Array.from({length: 40}, (_, i) => <p key={i}>Zeile {i + 1}: Formularinhalt zum Prüfen des Scrollbereichs.</p>)}</div>
      function Harness({kind, disabled = false}) {
        const [nested, setNested] = React.useState(false)
        const close = () => { window.headerCloseCalls = (window.headerCloseCalls || 0) + 1 }
        if (kind === 'changelog') return <ChangelogModal appVersion="5.2.1" onClose={close} />
        if (kind === 'update') return <UpdateAvailableModal state={{status: 'available', currentVersion: '5.2.0', availableVersion: '5.2.1'}} onClose={close} onDownload={async () => {}} onInstall={async () => {}} onDisable={async () => {}} />
        if (kind === 'party') return <PartyEditorModal initial={{name: 'OBI GmbH', iban: 'DE12500105170648489890'}} onClose={close} onSaved={() => {}} />
        if (kind === 'recurring') return <BookingPopupFrame variant="compact" anchorToTrigger={false} title="+ Dauerbuchung" subtitle="Vorlage für regelmäßig fällige Buchungen" onClose={close}><div style={{overflowY: 'auto'}}>{longBody}</div></BookingPopupFrame>
        if (kind === 'standard') return <BookingPopupFrame title="Export" onClose={close}>{longBody}</BookingPopupFrame>
        if (kind === 'donations') return <div className="modal-overlay"><div className="modal modal-wide donations-modal"><div className="donations-modal-sticky"><ModalHeader title="Spendenbescheinigung" onClose={close} /></div><div className="donations-modal-body">{longBody}</div></div></div>
        return <div className="modal-overlay" role="dialog"><form className={kind.startsWith('modal ') ? kind : 'modal modal-inset-header'} onSubmit={event => {event.preventDefault(); window.submitted = true}}>
          <ModalHeader title="Buchungsentwurf prüfen" subtitle="Importierte Originaldaten vergleichen" onClose={close} closeDisabled={disabled} actions={<button type="button" onClick={() => setNested(true)}>Details öffnen</button>} />
          {longBody}
          {nested && <div className="modal-overlay" role="dialog"><div className="modal modal-inset-header"><ModalHeader title="Details" onClose={() => setNested(false)} /><p>Unterdialog</p></div></div>}
        </form></div>
      }
      window.renderHeaderTest = (kind, disabled) => { window.headerCloseCalls = 0; window.submitted = false; root.render(<Harness key={kind + disabled} kind={kind} disabled={disabled} />) }
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty', '.md': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'raw-changelog', setup(build) {
      build.onResolve({ filter: /CHANGELOG\.md\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.replace('?raw', '')) }))
    } }]
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
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme
      document.documentElement.dataset.colorTheme = theme === 'dark' ? 'earthy-tones' : 'professional-light'
    }, theme)
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

for (const theme of ['light', 'dark']) {
  test(`modal title bars meet the frame before and after scrolling (${theme})`, async ({ page }, testInfo) => {
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme
      document.documentElement.dataset.colorTheme = theme === 'dark' ? 'earthy-tones' : 'professional-light'
    }, theme)
    for (const width of [1280, 600]) {
      await page.setViewportSize({ width, height: 740 })
      for (const kind of ['changelog', 'update', 'standard', 'donations', 'recurring', 'party', ...insetLayouts]) {
        await page.evaluate(kind => (window as any).renderHeaderTest(kind), kind)
        const header = page.locator('.modal-header-bar').first()
        await expect(header).toBeVisible()
        for (const scrolled of [false, true]) {
          if (scrolled) await header.evaluate(element => {
            const modal = element.closest('.modal')!
            for (const node of [modal, ...modal.querySelectorAll<HTMLElement>('div, form')]) {
              if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) node.scrollTop = node.scrollHeight
            }
          })
          const edges = await header.evaluate(element => {
            const modal = element.closest('.modal')!
            const frame = modal.getBoundingClientRect(), title = element.getBoundingClientRect()
            return {
              left: title.left - frame.left - modal.clientLeft,
              right: frame.left + modal.clientLeft + modal.clientWidth - title.right,
              top: title.top - frame.top - modal.clientTop,
              horizontalOverflow: modal.scrollWidth - modal.clientWidth
            }
          })
          for (const [edge, gap] of Object.entries(edges)) expect(Math.abs(gap), `${kind}, ${width}px, scrolled=${scrolled}: ${edge}`).toBeLessThanOrEqual(1)
          await expect(header.getByRole('button', { name: 'Schließen', exact: true })).toBeInViewport()
        }
        if (width === 600 && ['changelog', 'update', 'donations'].includes(kind)) await page.screenshot({ path: testInfo.outputPath(`${kind}-${theme}.png`) })
      }
    }
  })
}
