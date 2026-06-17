import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'unsupported'

export type UpdateState = {
    status: UpdateStatus
    currentVersion: string
    availableVersion: string | null
    downloadedVersion: string | null
    downloadProgress: number | null
    message: string | null
}

let initialized = false

let updateState: UpdateState = {
    status: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadedVersion: null,
    downloadProgress: null,
    message: app.isPackaged ? null : 'Updates sind nur in der installierten App verfügbar.'
}

function broadcastUpdateState() {
    for (const win of BrowserWindow.getAllWindows()) {
        try {
            win.webContents.send('updates:state', updateState)
        } catch {
        }
    }
}

function setUpdateState(patch: Partial<UpdateState>) {
    updateState = { ...updateState, ...patch, currentVersion: app.getVersion() }
    broadcastUpdateState()
}

function toMessage(error: unknown) {
    const text = String((error as any)?.message || error || 'Unbekannter Fehler')
    return text.replace(/^Error: /, '')
}

export function initUpdateManager() {
    if (initialized) return
    initialized = true

    if (!app.isPackaged) {
        broadcastUpdateState()
        return
    }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('checking-for-update', () => {
        setUpdateState({
            status: 'checking',
            availableVersion: null,
            downloadedVersion: null,
            downloadProgress: null,
            message: 'Suche nach Updates...'
        })
    })

    autoUpdater.on('update-available', (info) => {
        setUpdateState({
            status: 'available',
            availableVersion: info.version,
            downloadedVersion: null,
            downloadProgress: null,
            message: `Update ${info.version} ist verfügbar.`
        })
    })

    autoUpdater.on('download-progress', (progress) => {
        setUpdateState({
            status: 'downloading',
            downloadProgress: Math.max(0, Math.min(100, Math.round(progress.percent))),
            message: updateState.availableVersion
                ? `Update ${updateState.availableVersion} wird heruntergeladen...`
                : 'Update wird heruntergeladen...'
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        setUpdateState({
            status: 'downloaded',
            availableVersion: info.version,
            downloadedVersion: info.version,
            downloadProgress: 100,
            message: `Update ${info.version} ist bereit zur Installation.`
        })
    })

    autoUpdater.on('update-not-available', () => {
        setUpdateState({
            status: 'not-available',
            availableVersion: null,
            downloadedVersion: null,
            downloadProgress: null,
            message: 'Keine Updates verfügbar.'
        })
    })

    autoUpdater.on('error', (error) => {
        setUpdateState({
            status: 'error',
            downloadProgress: null,
            message: `Update fehlgeschlagen: ${toMessage(error)}`
        })
    })
}

export function getUpdateState() {
    return updateState
}

export async function checkForAppUpdates() {
    if (!app.isPackaged) {
        setUpdateState({
            status: 'unsupported',
            message: 'Updates sind nur in der installierten App verfügbar.'
        })
        return updateState
    }

    if (updateState.status === 'checking' || updateState.status === 'downloading') {
        return updateState
    }

    try {
        await autoUpdater.checkForUpdates()
    } catch (error) {
        setUpdateState({
            status: 'error',
            downloadProgress: null,
            message: `Update-Prüfung fehlgeschlagen: ${toMessage(error)}`
        })
    }

    return updateState
}

export async function downloadAppUpdate() {
    if (!app.isPackaged) {
        setUpdateState({
            status: 'unsupported',
            message: 'Updates sind nur in der installierten App verfügbar.'
        })
        return updateState
    }

    if (updateState.status === 'downloading' || updateState.status === 'downloaded') {
        return updateState
    }

    if (updateState.status !== 'available') {
        return updateState
    }

    try {
        setUpdateState({
            status: 'downloading',
            downloadProgress: 0,
            message: updateState.availableVersion
                ? `Update ${updateState.availableVersion} wird heruntergeladen...`
                : 'Update wird heruntergeladen...'
        })
        await autoUpdater.downloadUpdate()
    } catch (error) {
        setUpdateState({
            status: 'error',
            downloadProgress: null,
            message: `Update-Download fehlgeschlagen: ${toMessage(error)}`
        })
    }

    return updateState
}

export async function installAppUpdate() {
    if (updateState.status !== 'downloaded') {
        return { ok: false, state: updateState }
    }

    setUpdateState({
        message: `Update ${updateState.downloadedVersion || updateState.availableVersion || ''} wird installiert...`
    })

    setImmediate(() => {
        autoUpdater.quitAndInstall()
    })

    return { ok: true, state: updateState }
}
