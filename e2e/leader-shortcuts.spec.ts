import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let componentScript: string
let componentStyles: string

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { LeaderShortcuts } from './src/renderer/components/shortcuts/LeaderShortcuts'
        createRoot(document.getElementById('root')).render(
          <LeaderShortcuts commands={[
            { key: 'n', label: 'Neue Buchung', global: true, action: () => {
              document.getElementById('result').textContent += 'Neu'
            }},
            { key: 'a', label: 'KI aufrufen', target: '#ai', global: true, action: () => { document.getElementById('result').textContent = 'KI' }},
            { key: 'b', label: 'Buchungen', target: '#nav', action: () => {
              document.getElementById('result').textContent = 'Buchungen'
            }}
          ]} />
        )
      `,
      resolveDir: process.cwd(), loader: 'tsx'
    },
    bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  componentScript = result.outputFiles[0].text
  componentStyles = await readFile('src/renderer/components/shortcuts/shortcuts.css', 'utf8')
})

test.beforeEach(async ({ page }) => {
  await page.setContent(`<style>
    :root { --surface: #202532; --text: #fff; --accent: #82baff; --border: #444; }
    body { margin: 30px; } button { padding: 12px; margin: 10px; }
    .leader-shortcut-trigger { position: fixed; bottom: 10px; left: 10px; }
  </style><button id="nav">Buchungen</button><button id="edit" onclick="document.querySelector('#result').textContent='Bearbeitet'">Bearbeiten</button><button disabled>Gesperrt</button><button hidden>Verborgen</button><input id="input"><div id="root"></div><div id="result"></div>`)
  await page.addStyleTag({ content: componentStyles })
  await page.addScriptTag({ content: componentScript })
  await expect(page.locator('.leader-shortcut-trigger')).toBeVisible()
})

test('Alt fades badges onto controls and toggles without a menu or backdrop', async ({ page }) => {
  await page.keyboard.down('Alt')
  await expect(page.locator('.shortcut-badge').filter({ hasText: /^B$/ })).toBeVisible()
  await expect(page.locator('.shortcut-global-flyout')).toBeVisible()
  await expect(page.locator('.leader-shortcut-panel, .leader-shortcut-backdrop')).toHaveCount(0)
  await page.keyboard.up('Alt')
  await expect(page.locator('.shortcut-badge')).toHaveCount(2)
  await page.keyboard.press('Alt')
  await expect(page.locator('.shortcut-badge')).toHaveCount(0)
  await page.keyboard.press('Alt')
  await page.keyboard.press('b')
  await expect(page.locator('#result')).toHaveText('Buchungen')
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
})

test('direct Alt shortcuts and local badges resolve key collisions', async ({ page }) => {
  await page.keyboard.press('Alt+b')
  await expect(page.locator('#result')).toHaveText('Buchungen')
  await page.keyboard.press('Alt')
  const badge = page.locator('.shortcut-badge[aria-label^="Bearbeiten:"]')
  const key = await badge.innerText()
  expect(key).not.toBe('B')
  expect(key).not.toBe('N')
  await page.keyboard.press(key.toLowerCase())
  await expect(page.locator('#result')).toHaveText('Bearbeitet')
})

test('global Alt+N works inside inputs without changing their text', async ({ page }) => {
  await page.locator('#input').fill('Entwurf')
  await page.keyboard.press('Alt+n')
  await expect(page.locator('#result')).toHaveText('Neu')
  await expect(page.locator('#input')).toHaveValue('Entwurf')
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
})

test('AltGr, other modifiers, repeats and focus loss cannot trigger accidental actions', async ({ page }) => {
  await page.locator('#input').focus()
  await page.keyboard.press('Control+Alt+n')
  await expect(page.locator('#result')).toBeEmpty()
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
  await page.keyboard.down('Alt')
  await page.keyboard.down('n')
  await page.keyboard.down('n')
  await page.keyboard.up('n')
  await page.keyboard.up('Alt')
  await expect(page.locator('#result')).toHaveText('Neu')
  await page.keyboard.down('Alt')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('Alt')
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
  await page.keyboard.press('Alt+Tab')
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
})

test('dialogs expose only foreground actions and retain global shortcuts', async ({ page }) => {
  await page.evaluate(() => {
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.style.cssText = 'position:fixed;inset:0;background:#333;z-index:10;padding:50px'
    modal.innerHTML = '<button>Speichern</button><button disabled>Entfernen</button>'
    document.body.append(modal)
  })
  await page.keyboard.press('Alt')
  await expect(page.locator('.shortcut-badge')).toHaveCount(1)
  await expect(page.locator('.shortcut-badge')).toHaveAttribute('aria-label', 'Speichern: Alt + S')
  await page.keyboard.press('Alt+n')
  await expect(page.locator('#result')).toHaveText('Neu')
})

test('Escape dismisses hints before the underlying dialog receives it', async ({ page }) => {
  await page.evaluate(() => window.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelector('#result')!.textContent = 'Dialog geschlossen'
  }))
  await page.keyboard.press('Alt')
  await page.keyboard.press('Escape')
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
  await expect(page.locator('#result')).toBeEmpty()
  await page.keyboard.press('Escape')
  await expect(page.locator('#result')).toHaveText('Dialog geschlossen')
})

test('badges update when actions are disabled or the layout changes', async ({ page }) => {
  await page.keyboard.press('Alt')
  const badge = page.locator('.shortcut-badge[aria-label^="Bearbeiten:"]')
  const before = await badge.boundingBox()
  await page.locator('#edit').evaluate(element => { element.style.marginLeft = '120px' })
  await expect.poll(async () => (await badge.boundingBox())!.x).toBeGreaterThan(before!.x + 80)
  await page.locator('#edit').evaluate(element => { (element as HTMLButtonElement).disabled = true })
  await expect(badge).toHaveCount(0)
})

test('pages with many actions support unique multi-letter badges', async ({ page }) => {
  await page.evaluate(() => {
    for (let index = 0; index < 32; index++) {
      const button = document.createElement('button')
      button.textContent = `Aktion ${index}`
      button.onclick = () => { document.querySelector('#result')!.textContent = button.textContent }
      document.body.append(button)
    }
  })
  await page.keyboard.press('Alt')
  const badge = page.locator('.shortcut-badge').filter({ hasText: /^Y[A-Z]{2}$/ }).first()
  const key = await badge.innerText()
  const label = (await badge.getAttribute('aria-label'))!.split(': Alt')[0]
  await page.keyboard.type(key.toLowerCase())
  await expect(page.locator('#result')).toHaveText(label)
  await expect(page.locator('.shortcut-hints')).toHaveCount(0)
})


test('window controls are excluded and Alt+A opens AI from an input', async ({ page }) => {
  await page.evaluate(() => {
    const controls = document.createElement('div')
    controls.dataset.shortcutIgnore = ''
    controls.innerHTML = '<button>Minimieren</button><button>Schließen</button>'
    document.body.prepend(controls)
    const ai = document.createElement('button')
    ai.id = 'ai'
    ai.textContent = 'KI'
    document.body.prepend(ai)
  })
  await page.keyboard.press('Alt')
  await expect(page.locator('.shortcut-badge[aria-label^="Minimieren:"]')).toHaveCount(0)
  await expect(page.locator('.shortcut-badge[aria-label^="Schließen:"]')).toHaveCount(0)
  await expect(page.locator('.shortcut-badge[aria-label^="KI aufrufen:"]')).toHaveText('A')
  await page.locator('#input').fill('Entwurf')
  await page.keyboard.press('Alt+a')
  await expect(page.locator('#result')).toHaveText('KI')
  await expect(page.locator('#input')).toHaveValue('Entwurf')
})
