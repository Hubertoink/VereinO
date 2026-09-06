import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type Client = {
  address: string
  pid: number
  title: string
  size: [number, number]
  at: [number, number]
  workspace: { id: number }
  xwayland: boolean
}
const hypr = (...args: string[]) => execFileSync('hyprctl', args, { encoding: 'utf8' })
const clients = (): Client[] => JSON.parse(hypr('clients', '-j'))

// Opt-in integration check on a real Hyprland session. Only test-owned windows
// are moved; no desktop settings or existing windows are modified.
test('native Wayland surface fits its compositor tile', async () => {
  test.skip(
    process.env.VEREINO_HYPRLAND_E2E !== '1' || !process.env.HYPRLAND_INSTANCE_SIGNATURE,
    'Requires an explicit native Hyprland test run'
  )
  test.setTimeout(120_000)
  const captureDesktop = process.env.VEREINO_CAPTURE_TILING === '1'
  const previousWorkspace = JSON.parse(hypr('activeworkspace', '-j')).id as number
  const occupied = new Set(clients().map((client) => client.workspace.id))
  let workspace = 90
  while (occupied.has(workspace)) workspace++
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-native-'))
  let app: ElectronApplication | undefined
  try {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [
        path.resolve('dist-electron/main/index.cjs'),
        `--user-data-dir=${userDataDir}`,
        '--ozone-platform=wayland'
      ],
      env: {
        ...env,
        ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString()
      }
    })
    const page = await app.firstWindow()
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 30_000
    })
    await page.evaluate(async () => {
      await window.api.settings.set({ key: 'backup.lastAuto', value: Date.now() })
      await window.api.settings.set({ key: 'updates.autoCheck', value: false })
    })
    const later = page.getByRole('button', { name: 'Später', exact: true })
    if (await later.isVisible()) await later.click()
    const pid = app.process().pid!
    await expect.poll(() => clients().filter((client) => client.pid === pid).length).toBe(1)
    const main = clients().find((client) => client.pid === pid)!
    hypr(
      'eval',
      `hl.dispatch(hl.dsp.window.move({ workspace = "${workspace}", window = "address:${main.address}", follow = false }))`
    )
    await app.evaluate(({ BrowserWindow }) => {
      const peer = new BrowserWindow({
        width: 640,
        height: 680,
        title: 'VereinO Tiling Test Peer',
        webPreferences: { sandbox: true }
      })
      void peer.loadURL('data:text/html,<title>VereinO Tiling Test Peer</title><p>Tiling test</p>')
    })
    await expect.poll(() => clients().filter((client) => client.pid === pid).length).toBe(2)
    const peer = clients().find((client) => client.pid === pid && client.address !== main.address)!
    hypr(
      'eval',
      `hl.dispatch(hl.dsp.window.move({ workspace = "${workspace}", window = "address:${peer.address}", follow = false }))`
    )
    if (captureDesktop) hypr('eval', `hl.dispatch(hl.dsp.focus({ workspace = "${workspace}" }))`)
    await page.waitForTimeout(1000)
    const tile = clients().find((client) => client.address === main.address)!
    expect(tile.xwayland).toBe(false)
    const viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scale: devicePixelRatio
    }))
    console.log({ tile: tile.size, viewport })
    await page.screenshot({
      path: 'test-results/native-tiling-surface.png',
      animations: 'disabled'
    })
    expect(viewport.width, 'Renderer must not exceed the actual compositor tile').toBe(tile.size[0])
    expect(viewport.height).toBe(tile.size[1])
    for (const name of [
      'Buchungen',
      'Reports',
      'Mitglieder',
      'Bankimport',
      'Verbindlichkeiten',
      'Budgets',
      'Zweckbindungen',
      'Einstellungen'
    ]) {
      const nav = page.getByRole('button', { name, exact: true })
      await nav.click()
      await page.waitForTimeout(300)
      for (const button of await page.locator('.app-header__controls button').all()) {
        await button.click({ trial: true })
        const r = await button.boundingBox()
        expect(r!.y).toBeGreaterThanOrEqual(0)
        expect(r!.y + r!.height).toBeLessThanOrEqual(tile.size[1])
      }
      const escaped = await page
        .locator(
          '.app-header__controls button, .app-main input:visible, .app-main header button:visible, .journal-filter-controls button:visible, .report-toolbar-actions button:visible'
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)
            })
            .map((el) => ({
              element: el.className,
              text: el.getAttribute('aria-label') || el.textContent
            }))
        )
      await page.screenshot({
        path: `test-results/native-tiling-${name}.png`,
        animations: 'disabled'
      })
      if (captureDesktop && ['Buchungen', 'Reports', 'Einstellungen'].includes(name)) {
        // Capture only the test-owned tile, never the rest of the desktop.
        const currentTile = clients().find((client) => client.address === main.address)!
        execFileSync('grim', [
          '-g',
          `${currentTile.at[0]},${currentTile.at[1]} ${currentTile.size[0]}x${currentTile.size[1]}`,
          `test-results/native-desktop-${name}.png`
        ])
      }
      expect(escaped, `${name}: controls outside native viewport`).toEqual([])
    }
    await page.getByRole('button', { name: 'Verbindlichkeiten', exact: true }).click()
    await page.getByRole('button', { name: 'Rechnung erfassen', exact: true }).click()
    const scan = page.getByRole('dialog', { name: 'Rechnung erfassen', exact: true })
    await expect(scan).toBeVisible()
    const scanBounds = await scan.boundingBox()
    expect(scanBounds!.x).toBeGreaterThanOrEqual(10)
    expect(scanBounds!.x + scanBounds!.width).toBeLessThanOrEqual(tile.size[0] - 10)
    expect(await scan.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: 'test-results/native-tiling-invoice-scan.png', animations: 'disabled' })
    await scan.getByRole('button', { name: 'Rechnungserfassung schließen', exact: true }).click()
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    for (const nav of await page.locator('.settings-clusters, .settings-subnav').all()) {
      expect(await nav.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    }
    const originalGlass = await page.evaluate(() =>
      document.documentElement.getAttribute('data-glass-modals')
    )
    for (const glass of ['true', 'false']) {
      const colors = await page.evaluate((glass) => {
        document.documentElement.setAttribute('data-glass-modals', glass)
        const header = getComputedStyle(document.querySelector('.app-header')!)
        const sidebar = getComputedStyle(document.querySelector('.app-sidebar')!)
        return {
          header: header.backgroundColor,
          sidebar: sidebar.backgroundColor,
          seam: header.borderBottomWidth
        }
      }, glass)
      expect(colors.sidebar).toBe(colors.header)
      expect(colors.seam).toBe('0px')
    }
    await page.evaluate((glass) => {
      if (glass === null) document.documentElement.removeAttribute('data-glass-modals')
      else document.documentElement.setAttribute('data-glass-modals', glass)
    }, originalGlass)
    await page.locator('.leader-shortcut-trigger').click()
    const shortcuts = page.locator('.leader-shortcut-panel')
    await expect(shortcuts).toBeVisible()
    const menuBounds = await shortcuts.boundingBox()
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0)
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(tile.size[0])
    expect(await shortcuts.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.mouse.move(1, 1)
    await page.screenshot({
      path: 'test-results/native-tiling-shortcuts.png',
      animations: 'disabled'
    })
    if (captureDesktop) {
      const currentTile = clients().find((client) => client.address === main.address)!
      execFileSync('grim', [
        '-g',
        `${currentTile.at[0]},${currentTile.at[1]} ${currentTile.size[0]}x${currentTile.size[1]}`,
        'test-results/native-desktop-shortcuts.png'
      ])
    }
    await page.keyboard.press('Escape')
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    if (captureDesktop)
      hypr('eval', `hl.dispatch(hl.dsp.focus({ workspace = "${previousWorkspace}" }))`)
    await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
