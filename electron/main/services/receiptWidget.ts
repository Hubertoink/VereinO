import { app, BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  widgetBounds,
  type WidgetPosition,
  type WidgetState,
  type WidgetAutostart
} from '../../../shared/receiptWidget'

export const WIDGET_STARTUP_ARG = '--receipt-widget'

export function getWidgetAutostart(): WidgetAutostart {
  if (!['win32', 'darwin'].includes(process.platform))
    return {
      enabled: false,
      available: false,
      reason: 'System-Autostart ist derzeit unter Windows und macOS verfügbar.'
    }
  if (!app.isPackaged)
    return {
      enabled: false,
      available: false,
      reason: 'Autostart lässt sich in der installierten Version aktivieren.'
    }
  const settings = app.getLoginItemSettings(
    process.platform === 'win32' ? { path: process.execPath, args: [WIDGET_STARTUP_ARG] } : {}
  )
  return {
    enabled:
      settings.openAtLogin &&
      (process.platform !== 'win32' || settings.executableWillLaunchAtLogin),
    available: true
  }
}

export function setWidgetAutostart(enabled: boolean): WidgetAutostart {
  const state = getWidgetAutostart()
  if (!state.available) throw new Error(state.reason)
  app.setLoginItemSettings({
    openAtLogin: enabled,
    ...(process.platform === 'win32' ? { path: process.execPath, args: [WIDGET_STARTUP_ARG] } : {})
  })
  const updated = getWidgetAutostart()
  if (updated.enabled !== enabled)
    throw new Error(
      'Die Autostart-Einstellung wurde vom Betriebssystem nicht übernommen. Bitte die Anmeldeobjekte in den Systemeinstellungen prüfen.'
    )
  return updated
}

export function createReceiptWidgetController(options: {
  preload: string
  rendererFile: string
  rendererUrl?: string
  showMain: () => boolean
  isQuitting: () => boolean
}) {
  let win: BrowserWindow | null = null
  let expanded = false
  let position: WidgetPosition = { edge: 'right', y: NaN }
  const state = (): WidgetState => ({ expanded, edge: position.edge })
  const configPath = () => path.join(app.getPath('userData'), 'receipt-widget.json')
  function persist() {
    const destination = configPath()
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(`${destination}.tmp`, JSON.stringify(position), 'utf8')
    fs.renameSync(`${destination}.tmp`, destination)
  }
  function layout() {
    if (!win || win.isDestroyed()) return
    const display =
      screen.getAllDisplays().find((item) => item.id === position.displayId) ||
      screen.getPrimaryDisplay()
    position.displayId = display.id
    win.setBounds(widgetBounds(display.workArea, position, expanded))
    win.webContents.send('receiptWidget:state', state())
  }
  const controller = {
    get window() {
      return win
    },
    state,
    setExpanded(next: boolean) {
      expanded = next
      layout()
      return state()
    },
    moveToCursor() {
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      position = {
        edge: cursor.x < display.workArea.x + display.workArea.width / 2 ? 'left' : 'right',
        y: cursor.y,
        displayId: display.id
      }
      layout()
      return state()
    },
    finishMove() {
      persist()
      return state()
    },
    close() {
      win?.close()
      return { ok: true }
    },
    async open() {
      if (win && !win.isDestroyed()) {
        win.showInactive()
        return { ok: true }
      }
      try {
        const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
        if ((saved.edge === 'left' || saved.edge === 'right') && Number.isFinite(saved.y))
          position = saved
      } catch {
        /* First launch or invalid position: use the primary screen. */
      }
      expanded = false
      const display =
        screen.getAllDisplays().find((item) => item.id === position.displayId) ||
        screen.getPrimaryDisplay()
      const window = new BrowserWindow({
        ...widgetBounds(display.workArea, position, false),
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        title: 'VereinO – Belegwidget',
        webPreferences: {
          preload: options.preload,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false
        }
      })
      win = window
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      // Windows can reset the initial topmost flag when showing a transparent window inactive.
      window.on('show', () => window.setAlwaysOnTop(true))
      window.once('ready-to-show', () => window.showInactive())
      const relayout = () => layout()
      screen.on('display-removed', relayout)
      screen.on('display-metrics-changed', relayout)
      window.on('closed', () => {
        screen.removeListener('display-removed', relayout)
        screen.removeListener('display-metrics-changed', relayout)
        win = null
        if (!options.isQuitting()) options.showMain()
      })
      try {
        if (options.rendererUrl) {
          const url = new URL(options.rendererUrl)
          url.searchParams.set('window', 'receipt-widget')
          await window.loadURL(url.toString())
        } else await window.loadFile(options.rendererFile, { query: { window: 'receipt-widget' } })
      } catch (error) {
        window.destroy()
        throw error
      }
      return { ok: true }
    }
  }
  return controller
}
