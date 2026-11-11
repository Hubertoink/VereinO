import { handleBackupIo, type BackupIoRequest } from '../services/backupIo'

// No Electron main-process services or live database connections in this process.
process.parentPort.once('message', async ({ data }: { data: BackupIoRequest }) => {
  try {
    const result = await handleBackupIo(data, progress => process.parentPort.postMessage({ type: 'progress', progress }))
    process.parentPort.postMessage({ type: 'result', result })
  } catch (error) {
    process.parentPort.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
})
