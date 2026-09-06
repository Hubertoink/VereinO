import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('widget startup hides the main window and restores a docked position', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-widget-startup-'))
  await fs.writeFile(
    path.join(userData, 'receipt-widget.json'),
    JSON.stringify({ edge: 'left', y: 340, displayId: -999 })
  )
  const launchEnv = { ...process.env }
  delete launchEnv.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [
      path.resolve('dist-electron/main/index.cjs'),
      `--user-data-dir=${userData}`,
      '--receipt-widget'
    ],
    env: {
      ...launchEnv,
      ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).toString(),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  try {
    await expect
      .poll(() => app.windows().some((page) => page.url().includes('window=receipt-widget')), {
        timeout: 25000
      })
      .toBe(true)
    const widget = app.windows().find((page) => page.url().includes('window=receipt-widget'))!
    await expect(widget.getByRole('button', { name: 'Belegwidget aufklappen' })).toBeVisible()
    // Organization backgrounds must not paint into the droplet's transparent corners.
    await widget.evaluate(() => {
      document.documentElement.setAttribute('data-color-theme', 'monochrome')
      document.documentElement.setAttribute('data-background-image', 'mountain-snow')
      document.documentElement.style.setProperty('--background-image-opacity', '0.8')
    })
    const cornerAlpha = () => app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('window=receipt-widget'))!
      const capture = await window.webContents.capturePage()
      const bitmap = capture.toBitmap({ scaleFactor: 1 })
      return bitmap[Math.floor(capture.getSize(1).width / 2) * 4 + 3]
    })
    const windowState = () =>
      app.evaluate(({ BrowserWindow, screen }) => {
        const windows = BrowserWindow.getAllWindows()
        const main = windows.find((win) => !win.webContents.getURL().includes('window='))
        const widget = windows.find((win) =>
          win.webContents.getURL().includes('window=receipt-widget')
        )!
        return {
          mainVisible: main?.isVisible(),
          bounds: widget.getBounds(),
          area: screen.getDisplayMatching(widget.getBounds()).workArea,
          onTop: widget.isAlwaysOnTop(), visible: widget.isVisible()
        }
      })
    await expect.poll(async () => (await windowState()).mainVisible).toBe(false)
    const initial = await windowState()
    expect(initial.bounds.width).toBe(44)
    expect(initial.bounds.x).toBe(initial.area.x)
    await expect.poll(async () => { const state = await windowState(); return { onTop: state.onTop, visible: state.visible } }).toEqual({ onTop: true, visible: true })
    await expect.poll(cornerAlpha).toBe(0)
    await widget.getByRole('button', { name: 'Belegwidget aufklappen' }).click()
    await expect.poll(async () => (await windowState()).bounds.width).toBe(300)
    expect((await windowState()).bounds.x).toBe(initial.area.x)
    await widget.getByRole('button', { name: 'Einklappen', exact: true }).click()
    await expect.poll(async () => (await windowState()).bounds.width).toBe(44)
    await expect.poll(cornerAlpha).toBe(0)
    await widget.screenshot({ path: 'test-results/widget-background-transparency.png', animations: 'disabled', omitBackground: true })

    // Exercise the native docking bridge without moving the user's real cursor.
    await app.evaluate(({ screen }) => {
      const area = screen.getPrimaryDisplay().workArea
      const actual = screen.getCursorScreenPoint
      ;(screen as any).__restoreWidgetCursor = () => {
        screen.getCursorScreenPoint = actual
      }
      screen.getCursorScreenPoint = () => ({ x: area.x + area.width - 5, y: area.y + 400 })
    })
    await widget.evaluate(async () => {
      await window.api.receiptWidget.move(false)
      await window.api.receiptWidget.move(true)
    })
    await app.evaluate(({ screen }) => {
      ;(screen as any).__restoreWidgetCursor()
    })
    const moved = await windowState()
    expect(moved.bounds.x + moved.bounds.width).toBe(moved.area.x + moved.area.width)
    expect(
      JSON.parse(await fs.readFile(path.join(userData, 'receipt-widget.json'), 'utf8')).edge
    ).toBe('right')
    await widget.getByRole('button', { name: 'Belegwidget aufklappen' }).click()
    await widget.getByRole('button', { name: 'Belegwidget schließen' }).click()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((win) => win.isVisible())
        )
      )
      .toBe(true)
  } finally {
    const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await exited
    await fs.rm(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
