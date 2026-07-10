import { app, BrowserWindow, shell, Menu, session, dialog, screen } from 'electron'
import { getDb } from './db/database'
import { getSetting, setSetting } from './services/settings'
import * as backup from './services/backup'
import { applyMigrations } from './db/migrations'
import { requireAllowedExternalUrl } from './services/externalUrl'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const detachedQuickAddInitials = new Map<string, any>()
const detachedQuickAddWindows = new Map<string, BrowserWindow>()
const DETACHED_QUICK_ADD_BOUNDS_SETTING = 'ui.detachedQuickAddBounds'
let pendingMainCloseWindow: BrowserWindow | null = null
let pendingMainCloseConfirmed = false
let pendingSecondInstanceFocus = false

function focusPrimaryWindow() {
    const windows = BrowserWindow.getAllWindows()
    const primary =
        windows.find((win) => !(win as any).__isDetachedQuickAddWindow) ?? windows[0] ?? null
    if (!primary || primary.isDestroyed()) return false
    if (primary.isMinimized()) primary.restore()
    primary.show()
    primary.focus()
    return true
}

if (!hasSingleInstanceLock) {
    dialog.showErrorBox(
        'VereinO ist bereits geöffnet',
        'Es läuft bereits eine Instanz von VereinO. Bitte verwenden Sie das bereits geöffnete Fenster.'
    )
    app.quit()
} else {
    app.on('second-instance', () => {
        pendingSecondInstanceFocus = !focusPrimaryWindow()
    })
}

type WindowBounds = { x: number; y: number; width: number; height: number }

function getDetachedQuickAddBounds(): WindowBounds | undefined {
    try {
        const saved = getSetting<Partial<WindowBounds>>(DETACHED_QUICK_ADD_BOUNDS_SETTING)
        if (![saved?.x, saved?.y, saved?.width, saved?.height].every(Number.isFinite)) return undefined

        const bounds = {
            x: Math.round(saved!.x!),
            y: Math.round(saved!.y!),
            width: Math.max(860, Math.round(saved!.width!)),
            height: Math.max(620, Math.round(saved!.height!))
        }
        const isVisible = screen.getAllDisplays().some(({ workArea }) => {
            const overlapWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
            const overlapHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
            return overlapWidth >= 100 && overlapHeight >= 100
        })
        return isVisible ? bounds : undefined
    } catch {
        return undefined
    }
}

function createWindowOpenHandler() {
    return ({ url }: { url: string }) => {
        try {
            const allowedUrl = requireAllowedExternalUrl(url)
            void shell.openExternal(allowedUrl).catch((error) => {
                console.error('Externe URL konnte nicht geöffnet werden:', error)
            })
        } catch (error) {
            console.warn('Blockierte externe URL:', error)
        }
        return { action: 'deny' as const }
    }
}

async function createDetachedQuickAddWindow(initialState?: any): Promise<{ ok: boolean; token: string }> {
    const token = `quick-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const draftId = typeof initialState?.draftId === 'string' ? initialState.draftId : token
    const existing = detachedQuickAddWindows.get(draftId)
    if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore()
        existing.focus()
        return { ok: true, token }
    }
    detachedQuickAddInitials.set(token, initialState || null)

    const savedBounds = getDetachedQuickAddBounds()
    const win = new BrowserWindow({
        width: 1180,
        height: 760,
        ...(savedBounds || {}),
        minWidth: 860,
        minHeight: 620,
        show: false,
        autoHideMenuBar: true,
        frame: false,
        title: 'VereinO - Buchung',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.cjs'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            devTools: isDev
        }
    })

    let allowClose = false
    ;(win as any).__isDetachedQuickAddWindow = true

    win.on('ready-to-show', () => win.show())
    detachedQuickAddWindows.set(draftId, win)
    win.on('close', (event) => {
        if (!allowClose && !win.webContents.isDestroyed()) {
            event.preventDefault()
            try { win.webContents.send('window:close-requested') } catch {
                allowClose = true
                win.close()
            }
            return
        }
        try { setSetting(DETACHED_QUICK_ADD_BOUNDS_SETTING, win.getNormalBounds()) } catch { }
    })
    win.on('closed', () => {
        detachedQuickAddInitials.delete(token)
        detachedQuickAddWindows.delete(draftId)
        for (const browserWindow of BrowserWindow.getAllWindows()) {
            try { browserWindow.webContents.send('quickAdd:detachedClosed', { draftId }) } catch { /* ignore */ }
        }
        if (pendingMainCloseWindow && !pendingMainCloseWindow.isDestroyed() && detachedQuickAddWindows.size === 0) {
            const mainWindow = pendingMainCloseWindow
            const confirmed = pendingMainCloseConfirmed
            pendingMainCloseWindow = null
            pendingMainCloseConfirmed = false
            if (confirmed) {
                try { ;(mainWindow as any).__allowRendererClose?.() } catch { }
            }
            mainWindow.close()
        }
    })

    ;(win as any).__allowRendererClose = () => {
        allowClose = true
    }

    if (isDev) {
        const baseUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
        const url = new URL(baseUrl)
        url.searchParams.set('window', 'quick-add')
        url.searchParams.set('token', token)
        await win.loadURL(url.toString())
    } else {
        await win.loadFile(path.join(__dirname, '../../dist/index.html'), {
            query: { window: 'quick-add', token }
        })
    }

    win.webContents.setWindowOpenHandler(createWindowOpenHandler())
    return { ok: true, token }
}

function focusDetachedQuickAddWindow(draftId: string) {
    const win = detachedQuickAddWindows.get(draftId)
    if (!win || win.isDestroyed()) return { ok: false }
    if (win.isMinimized()) win.restore()
    win.focus()
    return { ok: true }
}

function closeDetachedQuickAddWindow(draftId: string) {
    const win = detachedQuickAddWindows.get(draftId)
    if (!win || win.isDestroyed()) return { ok: false }
    win.close()
    return { ok: true }
}

function requestCloseDetachedQuickAddWindows(mainWindow?: BrowserWindow | null, confirmed = false) {
    const windows = Array.from(detachedQuickAddWindows.values()).filter((win) => !win.isDestroyed())
    if (!windows.length) return { ok: true, count: 0 }
    pendingMainCloseWindow = mainWindow && !detachedQuickAddWindowsHas(mainWindow) ? mainWindow : null
    pendingMainCloseConfirmed = confirmed
    for (const win of windows) {
        try { win.close() } catch { /* ignore */ }
    }
    return { ok: true, count: windows.length }
}

function cancelPendingMainClose() {
    pendingMainCloseWindow = null
    pendingMainCloseConfirmed = false
    return { ok: true }
}

function detachedQuickAddWindowsHas(win: BrowserWindow) {
    for (const detached of detachedQuickAddWindows.values()) {
        if (detached === win) return true
    }
    return false
}

const STARTUP_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#111827;color:#f8fafc;font:14px system-ui,sans-serif}
.startup{text-align:center}.mark{font-size:34px;font-weight:750;letter-spacing:.02em}.status{margin-top:12px;color:#94a3b8}
.bar{width:220px;height:3px;margin:20px auto 0;overflow:hidden;border-radius:4px;background:#273449}.bar:after{content:"";display:block;width:45%;height:100%;background:#38bdf8;animation:load 1.1s ease-in-out infinite alternate}@keyframes load{to{transform:translateX(125%)}}
</style></head><body><div class="startup"><div class="mark">VereinO</div><div class="status">Daten werden vorbereitet …</div><div class="bar"></div></div></body></html>`

async function loadRenderer(win: BrowserWindow) {
    if (isDev) {
        const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
        await win.loadURL(url)
    } else {
        await win.loadFile(path.join(__dirname, '../../dist/index.html'))
    }
}

async function createWindow(showStartup = false): Promise<BrowserWindow> {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        // Fits comfortably into a 50/50 snap on a 1920 px wide display while
        // preventing layouts that are too narrow to remain useful.
        minWidth: 900,
        minHeight: 640,
        show: false,
        autoHideMenuBar: true,
        frame: false,
        title: 'VereinO',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.cjs'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            devTools: isDev
        }
    })

    let allowClose = false

    win.on('ready-to-show', () => win.show())
    win.on('maximize', () => win.webContents.send('window:maximized', true))
    win.on('unmaximize', () => win.webContents.send('window:unmaximized', false))
    win.on('close', (event) => {
        if (allowClose || win.webContents.isDestroyed()) return
        event.preventDefault()
        if (detachedQuickAddWindows.size > 0) {
            requestCloseDetachedQuickAddWindows(win)
            return
        }
        try {
            win.webContents.send('window:close-requested')
        } catch {
            allowClose = true
            win.close()
        }
    })

    ;(win as any).__allowRendererClose = () => {
        allowClose = true
    }

    // Content Security Policy via headers (relaxed in dev for Vite/HMR)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const devCsp = [
            "default-src 'self' http://localhost:5173;",
            "base-uri 'self';",
            "object-src 'none';",
            "img-src 'self' data: blob:;",
            "frame-src 'self' blob:;",
            "child-src 'self' blob:;",
            "font-src 'self' data:;",
            "style-src 'self' 'unsafe-inline';",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: http://localhost:5173;",
            "connect-src 'self' http://localhost:5173 ws://localhost:5173 http://localhost:3000 https://*.mittwald.io;",
            "frame-ancestors 'none'"
        ].join(' ')

        const prodCsp = [
            "default-src 'self';",
            "base-uri 'self';",
            "object-src 'none';",
            "img-src 'self' data:;",
            "frame-src 'self' blob:;",
            "child-src 'self' blob:;",
            "font-src 'self' data:;",
            "style-src 'self' 'unsafe-inline';",
            "script-src 'self';",
            "connect-src 'self' https://*.mittwald.io;",
            "frame-ancestors 'none'"
        ].join(' ')

        const csp = isDev ? devCsp : prodCsp

        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp]
            }
        })
    })

    if (showStartup) {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(STARTUP_HTML)}`)
    } else {
        await loadRenderer(win)
    }

    win.webContents.setWindowOpenHandler(createWindowOpenHandler())

    return win
}

function createMenu() {
    if (isDev) {
        const template: Electron.MenuItemConstructorOptions[] = [
            { role: 'appMenu' },
            { role: 'fileMenu' },
            { role: 'editMenu' },
            { role: 'viewMenu' },
            { role: 'windowMenu' }
        ]
        const menu = Menu.buildFromTemplate(template)
        Menu.setApplicationMenu(menu)
    } else {
        // No application menu in production
        Menu.setApplicationMenu(null)
    }
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
    createMenu()
    // Make startup progress visible before native modules, schema checks and the
    // complete IPC graph are initialized.
    const win = await createWindow(true)
    if (pendingSecondInstanceFocus) {
        pendingSecondInstanceFocus = false
        focusPrimaryWindow()
    }

    // Try DB init + migrations, but don't exit on failure – let renderer handle recovery
    let dbInitError: any = null
    try {
        const db = getDb()
        ; (global as any).singletonDb = db

        applyMigrations(db)
        
        // CRITICAL FIX: Always ensure enforce_time_range columns exist
        // This handles cases where migration 20 might have failed silently
        try {
            const budgetCols = db.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>
            const hasEnforceInBudgets = budgetCols.some((c: { name: string }) => c.name === 'enforce_time_range')
            
            if (!hasEnforceInBudgets) {
                console.log('[Startup] Adding missing enforce_time_range columns')
                db.exec('ALTER TABLE budgets ADD COLUMN enforce_time_range INTEGER NOT NULL DEFAULT 0')
                db.exec('ALTER TABLE earmarks ADD COLUMN enforce_time_range INTEGER NOT NULL DEFAULT 0')
                
                // Mark migration 20 as applied if not already
                const migrations = db.prepare('SELECT version FROM migrations').all() as Array<{ version: number }>
                const hasV20 = migrations.some((m: { version: number }) => m.version === 20)
                if (!hasV20) {
                    db.prepare('INSERT INTO migrations(version) VALUES (?)').run(20)
                }
                console.log('[Startup] enforce_time_range columns added successfully')
            }
        } catch (colErr: any) {
            console.error('[Startup] Failed to ensure enforce_time_range columns:', colErr)
            // Don't throw - let the app try to start anyway
        }
    } catch (err: any) {
        console.error('DB init/migrations failed', err)
        dbInitError = err
        // Do NOT block startup. We'll inform the renderer via an event so it can present recovery options.
    }
    // Loading this graph after the startup window avoids blocking first paint.
    const { registerIpcHandlers } = await import('./ipc')
    // Register IPC first so renderer can use db.location.* to recover
    registerIpcHandlers({
        openDetachedQuickAdd: createDetachedQuickAddWindow,
        focusDetachedQuickAdd: focusDetachedQuickAddWindow,
        closeDetachedQuickAdd: closeDetachedQuickAddWindow,
        hasDetachedQuickAdds: () => detachedQuickAddWindows.size > 0,
        requestCloseDetachedQuickAdds: requestCloseDetachedQuickAddWindows,
        cancelPendingMainClose,
        getDetachedQuickAddInitial: (token: string) => detachedQuickAddInitials.get(token) ?? null,
        notifyQuickAddSaved: (payload: any) => {
            for (const browserWindow of BrowserWindow.getAllWindows()) {
                try { browserWindow.webContents.send('quickAdd:saved', payload || {}) } catch { /* ignore */ }
            }
        }
    })
    await loadRenderer(win)

    // After window finished load, inform renderer if DB init failed
    if (dbInitError && win) {
        const send = () => {
            try { win.webContents.send('db:initFailed', { message: String(dbInitError?.message || dbInitError) }) } catch { /* ignore */ }
        }
        if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', () => send())
        } else {
            send()
        }
    }

    // Auto-backup on startup (configurable)
    ;(async () => {
        try {
            const mode = (getSetting<string>('backup.auto') || 'PROMPT').toUpperCase() as 'SILENT' | 'PROMPT' | 'OFF'
            const intervalDays = Number(getSetting<number>('backup.intervalDays') || 7)
            const lastAuto = Number(getSetting<number>('backup.lastAuto') || 0)
            if (mode === 'OFF') return
            const now = Date.now()
            const due = !lastAuto || (now - lastAuto) > intervalDays * 24 * 60 * 60 * 1000
            if (!due) return
            if (mode === 'SILENT') {
                try { await backup.makeBackup('auto') } catch { /* ignore */ }
                setSetting('backup.lastAuto', now)
            } else if (mode === 'PROMPT') {
                // Renderer will handle user-facing prompt with a custom modal
                // (We avoid showing a native OS message box here to keep UX consistent.)
            }
        } catch { /* ignore */ }
    })()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
