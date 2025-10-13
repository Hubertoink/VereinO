import { app, BrowserWindow, shell, Menu, session, dialog } from 'electron'
import { getDb } from './db/database'
import { getSetting, setSetting } from './services/settings'
import * as backup from './services/backup'
import { applyMigrations } from './db/migrations'
import { registerIpcHandlers } from './ipc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

let quitting = false

async function createWindow() {
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
            sandbox: false, // Changed to false to allow localStorage persistence
            nodeIntegration: false,
            webSecurity: true,
            devTools: isDev
        }
    })

    win.on('ready-to-show', () => win.show())
    win.on('maximize', () => win.webContents.send('window:maximized', true))
    win.on('unmaximize', () => win.webContents.send('window:unmaximized', false))

    // Content Security Policy via headers (relaxed in dev for Vite/HMR)
    const headersListener: (details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void) => void = (details, callback) => {
        const devCsp = [
            "default-src 'self' http://localhost:5173;",
            "base-uri 'self';",
            "object-src 'none';",
            "img-src 'self' data: blob:;",
            "font-src 'self' data:;",
            "style-src 'self' 'unsafe-inline';",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: http://localhost:5173;",
            "connect-src 'self' http://localhost:5173 ws://localhost:5173;",
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
            "connect-src 'self';",
            "frame-ancestors 'none'"
        ].join(' ')

        const csp = isDev ? devCsp : prodCsp

        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp]
            }
        })
    }
    session.defaultSession.webRequest.onHeadersReceived(headersListener)

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

app.whenReady().then(() => {
    // DB init + migrations
    try {
        const db = getDb()
            ; (global as any).singletonDb = db
        applyMigrations(db)
    } catch (err: any) {
        console.error('DB init/migrations failed', err)
        dialog.showErrorBox('Datenbank-Fehler', String(err?.message || err))
        // In einem unrecoverable Zustand beenden
        app.exit(1)
        return
    }
    registerIpcHandlers()
    createMenu()
    createWindow()

    // Auto-backup on startup (configurable)
    ;(async () => {
        try {
            const mode = (getSetting<string>('backup.auto') || 'PROMPT').toUpperCase() as 'SILENT' | 'PROMPT' | 'OFF'
            const intervalDays = Number(getSetting<number>('backup.intervalDays') || 7)
            const lastAuto = Number(getSetting<number>('backup.lastAuto') || 0)
            const skipUntil = Number(getSetting<number>('backup.skipUntil') || 0)
            if (mode === 'OFF') return
            const now = Date.now()
            // Determine last backup time using either last auto-backup or the latest backup file timestamp
            let lastAny = lastAuto
            try { const list = backup.listBackups(); const m = list.backups?.[0]?.mtime || 0; if (m > lastAny) lastAny = m } catch { }
            const due = !lastAny || (now - lastAny) > intervalDays * 24 * 60 * 60 * 1000
            if (!due) return
            // Respect skip-until (renderer can set this to end-of-day)
            if (skipUntil && now < skipUntil) return
            if (mode === 'SILENT') {
                try { await backup.makeBackup('auto') } catch { /* ignore */ }
                setSetting('backup.lastAuto', now)
            } else if (mode === 'PROMPT') {
                // Prefer in-app modal: send an event to the renderer with days since the last backup
                const win = BrowserWindow.getAllWindows()[0]
                try {
                    const list = backup.listBackups()
                    const lastMtime = list.backups?.[0]?.mtime || 0
                    const reference = Math.max(lastAny, lastMtime)
                    const daysSince = reference ? Math.floor((now - reference) / (24 * 60 * 60 * 1000)) : intervalDays
                    const nextDue = reference ? (reference + intervalDays * 24 * 60 * 60 * 1000) : now
                    if (win) {
                        win.webContents.send('backup:prompt', { intervalDays, daysSince, nextDue })
                    } else {
                        // Fallback to native dialog if no window available
                        const res = await dialog.showMessageBox({
                            type: 'question',
                            buttons: ['Jetzt sichern', 'Später'],
                            defaultId: 0,
                            cancelId: 1,
                            title: 'Automatische Sicherung',
                            message: 'Seit der letzten Sicherung sind mehr als ' + intervalDays + ' Tag(e) vergangen. Möchtest du jetzt ein Backup erstellen?',
                        })
                        if (res.response === 0) {
                            try { await backup.makeBackup('auto') } catch { /* ignore */ }
                            setSetting('backup.lastAuto', now)
                        }
                    }
                } catch {
                    // As a safety, do nothing on error
                }
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

// Ensure we fully tear down background resources so the process can exit cleanly on Windows
app.on('before-quit', () => {
    quitting = true
    try {
        // Destroy any remaining BrowserWindows (incl. offscreen PDF windows)
        for (const w of BrowserWindow.getAllWindows()) {
            try { w.removeAllListeners() } catch {}
            try { w.destroy() } catch {}
        }
    } catch {}
    try {
        // Close DB to release file handles
        const { closeDb } = require('./db/database')
        closeDb()
    } catch {}
})

app.on('will-quit', () => {
    try {
        // Best-effort DB close in case before-quit didn't run
        const { closeDb } = require('./db/database')
        closeDb()
    } catch {}
})
