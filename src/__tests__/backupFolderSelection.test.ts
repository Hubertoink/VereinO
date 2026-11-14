import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import { registerBackupAndShellHandlers } from '../../electron/main/ipc/backupAndShellHandlers'
import { setBackupDirWithMigration } from '../../electron/main/services/backup'

jest.mock('electron', () => ({ dialog: { showOpenDialog: jest.fn() }, ipcMain: { handle: jest.fn() }, shell: {} }))
jest.mock('../../electron/main/services/backup', () => ({ setBackupDirWithMigration: jest.fn() }))

const targetDir = path.resolve('setup-backup-fixture')
let handlers: Map<string, (...args: any[]) => Promise<any>>
beforeEach(() => {
  jest.clearAllMocks()
  handlers = new Map()
  ;(ipcMain.handle as jest.Mock).mockImplementation((name, handler) => handlers.set(name, handler))
  ;(setBackupDirWithMigration as jest.Mock).mockResolvedValue({ ok: true, dir: targetDir, moved: 0 })
  registerBackupAndShellHandlers()
})

test('choosing a setup folder leaves backups unchanged until explicitly applied', async () => {
  ;(dialog.showOpenDialog as jest.Mock).mockResolvedValue({ canceled: false, filePaths: [targetDir] })
  await expect(handlers.get('backup.pickDir')!()).resolves.toEqual({ ok: true, dir: targetDir })
  expect(setBackupDirWithMigration).not.toHaveBeenCalled()
  await handlers.get('backup.setDir')!({}, { dir: targetDir })
  expect(setBackupDirWithMigration).toHaveBeenCalledWith(targetDir)
  expect(dialog.showOpenDialog).toHaveBeenCalledTimes(1)
})

test('canceling the setup picker does not change or migrate a folder', async () => {
  ;(dialog.showOpenDialog as jest.Mock).mockResolvedValue({ canceled: true, filePaths: [] })
  await expect(handlers.get('backup.pickDir')!()).resolves.toEqual({ ok: false, canceled: true })
  expect(setBackupDirWithMigration).not.toHaveBeenCalled()
})

test('the existing immediate folder picker still works and invalid deferred paths are rejected', async () => {
  ;(dialog.showOpenDialog as jest.Mock).mockResolvedValue({ canceled: false, filePaths: [targetDir] })
  await handlers.get('backup.setDir')!({})
  expect(setBackupDirWithMigration).toHaveBeenCalledTimes(1)
  for (const dir of ['', 'relative/path', 'C:\\bad\0path']) {
    await expect(handlers.get('backup.setDir')!({}, { dir })).resolves.toMatchObject({ ok: false })
  }
  expect(setBackupDirWithMigration).toHaveBeenCalledTimes(1)
})
