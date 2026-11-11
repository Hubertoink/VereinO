import path from 'node:path'
import { app, utilityProcess } from 'electron'
import type { BackupIoRequest, BackupIoResult, IoProgress } from './backupIo'

const children = new Set<Electron.UtilityProcess>()
app.once('before-quit', () => { for (const child of children) child.kill() })

export function runBackupIo(request: BackupIoRequest, onProgress?: (progress: IoProgress) => void, limits?: { idleMs: number; totalMs: number }): Promise<BackupIoResult> {
  const metadata = request.action === 'probe' || request.action === 'list'
  const idleMs = limits?.idleMs ?? (metadata ? 20_000 : 60_000)
  const totalMs = limits?.totalMs ?? (metadata ? 20_000 : 30 * 60_000)
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'backupIo.cjs'), [], { stdio: 'ignore', serviceName: 'VereinO Backup' })
    children.add(child)
    let settled = false
    let idleTimer: ReturnType<typeof setTimeout>
    const finish = (error?: Error, result?: BackupIoResult) => {
      if (settled) return
      settled = true
      clearTimeout(idleTimer)
      clearTimeout(totalTimer)
      child.kill()
      children.delete(child)
      if (error) reject(error)
      else resolve(result || {})
    }
    const timeout = () => finish(new Error('Zeitüberschreitung beim Dateizugriff. Das Laufwerk antwortet nicht oder die Übertragung dauert zu lange.'))
    const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(timeout, idleMs) }
    const totalTimer = setTimeout(timeout, totalMs)
    resetIdle()
    child.on('exit', code => finish(new Error(`Der Backup-Hilfsprozess wurde unerwartet beendet (${code}).`)))
    child.on('message', (message: { type: string; progress?: IoProgress; result?: BackupIoResult; error?: string }) => {
      if (settled) return
      if (message.type === 'progress' && message.progress) { resetIdle(); onProgress?.(message.progress) }
      else if (message.type === 'result') finish(undefined, message.result)
      else if (message.type === 'error') finish(new Error(message.error || 'Dateizugriff fehlgeschlagen.'))
    })
    child.once('spawn', () => { if (!settled) child.postMessage(request) })
  })
}
