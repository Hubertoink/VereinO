import { app, BrowserWindow, shell, Menu, session, dialog } from 'electron'
import { getDb } from './db/database'
import { getSetting, setSetting } from './services/settings'
import * as backup from './services/backup'
import { applyMigrations, ensureVoucherJunctionTables } from './db/migrations'
import { registerIpcHandlers } from './ipc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

async function createWindow(): Promise<BrowserWindow> {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
    minWidth: 1264,
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

    win.on('ready-to-show', () => win.show())
    win.on('maximize', () => win.webContents.send('window:maximized', true))
    win.on('unmaximize', () => win.webContents.send('window:unmaximized', false))

    // Content Security Policy via headers (relaxed in dev for Vite/HMR)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const devCsp = [
            "default-src 'self' http://localhost:5173;",
            "base-uri 'self';",
            "object-src 'none';",
            "img-src 'self' data: blob:;",
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

    if (isDev) {
        const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
        await win.loadURL(url)
        // DevTools can be opened manually via menu or keyboard
    } else {
        await win.loadFile(path.join(__dirname, '../../dist/index.html'))
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

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

app.whenReady().then(async () => {
    // Try DB init + migrations, but don't exit on failure – let renderer handle recovery
    let dbInitError: any = null
    try {
        const db = getDb()
        ; (global as any).singletonDb = db

        // Defensive: legacy DBs may miss junction tables even when most data loads.
        ensureVoucherJunctionTables(db)
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
    // Register IPC first so renderer can use db.location.* to recover
    registerIpcHandlers()
    createMenu()
    const win = await createWindow()

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
