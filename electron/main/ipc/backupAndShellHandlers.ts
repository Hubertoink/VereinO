import { dialog, ipcMain, shell } from 'electron'
import * as backup from '../services/backup'
import { requireAllowedExternalUrl } from '../services/externalUrl'

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function registerBackupAndShellHandlers(): void {
    ipcMain.handle('backup.make', async (_event, payload?: { reason?: string }) => {
        try {
            const result = await backup.makeBackup(payload?.reason)
            return { ok: true, filePath: result.filePath }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.list', async () => {
        try {
            return { ok: true, ...backup.listBackups() }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.openFolder', async () => {
        try {
            return await backup.openBackupFolder()
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.getDir', async () => {
        try {
            return { ok: true, dir: backup.getBackupDir() }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.setDir', async () => {
        try {
            const pick = await dialog.showOpenDialog({
                title: 'Backup-Ordner wählen…',
                properties: ['openDirectory', 'createDirectory']
            })
            if (pick.canceled || !pick.filePaths[0]) throw new Error('Abbruch')
            const result = backup.setBackupDirWithMigration(pick.filePaths[0])
            return { ok: result.ok, dir: result.dir, moved: result.moved }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.resetDir', async () => {
        try {
            const result = backup.setBackupDirWithMigration(null)
            return { ok: result.ok, dir: result.dir, moved: result.moved }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.inspect', async (_event, payload: { filePath: string }) => {
        try {
            return backup.inspectBackup(payload.filePath)
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.inspectCurrent', async () => {
        try {
            return backup.inspectCurrent()
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('backup.restore', async (_event, payload: { filePath: string }) => {
        try {
            return backup.restoreBackup(payload.filePath)
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })

    ipcMain.handle('shell.showItemInFolder', async (_event, payload: { fullPath: string }) => {
        try {
            shell.showItemInFolder(payload.fullPath)
            return { ok: true }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('shell.openPath', async (_event, payload: { fullPath: string }) => {
        try {
            const error = await shell.openPath(payload.fullPath)
            return { ok: !error, error: error || null }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
    ipcMain.handle('shell.openExternal', async (_event, payload: unknown) => {
        try {
            const rawUrl = payload && typeof payload === 'object' && 'url' in payload
                ? (payload as { url: unknown }).url
                : undefined
            await shell.openExternal(requireAllowedExternalUrl(rawUrl))
            return { ok: true }
        } catch (error) {
            return { ok: false, error: errorMessage(error) }
        }
    })
}
