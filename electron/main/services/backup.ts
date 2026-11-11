import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { runBackupIo } from './backupWorker'
import type { BackupProgress, BackupResult } from '../../../shared/backupProgress'
import { getSetting, setSetting } from './settings'
import { getAppDataDir, getCurrentDbInfo, getDb, closeDb } from '../db/database'
import { applyMigrations } from '../db/migrations'

export type BackupEntry = { filePath: string; size: number; mtime: number }
type BackupCounts = Record<string, number>
type BackupLastActivity = {
  voucher?: string | null
  invoice?: string | null
  member?: string | null
  audit?: string | null
}

const BACKUP_DIR_SETTING = 'backup.dir'
const INSPECTION_TABLES = [
  'vouchers',
  'invoice_files',
  'invoices',
  'voucher_files',
  'members',
  'tags'
] as const
const LAST_ACTIVITY_QUERIES: Record<keyof BackupLastActivity, string> = {
  voucher: 'SELECT MAX(date) AS v FROM vouchers',
  invoice: 'SELECT MAX(date) AS v FROM invoices',
  member: 'SELECT MAX(created_at) AS v FROM members',
  audit: 'SELECT MAX(created_at) AS v FROM audit_log'
}

function defaultBackupDir() {
  return path.join(getAppDataDir().root, 'backups')
}

function configuredBackupDir() {
  const cfg = getSetting<string>(BACKUP_DIR_SETTING)
  return typeof cfg === 'string' && cfg.trim() ? cfg.trim() : null
}

function snapshotDirForBackupFile(filePath: string) {
  return filePath.replace(/\.sqlite$/i, '.files')
}

function pathsEqual(left: string, right: string) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function ensureDir(dir: string) {
  fsSync.mkdirSync(dir, { recursive: true })
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function copyDirRecursive(src: string, dest: string) {
  if (!(await pathExists(src))) return
  await fs.cp(src, dest, { recursive: true, force: true })
}

async function clearDirContents(dir: string) {
  if (!(await pathExists(dir))) return
  const entries = await fs.readdir(dir, { withFileTypes: true })
  await Promise.all(entries.map((entry) => fs.rm(path.join(dir, entry.name), { recursive: true, force: true })))
}

function relinkFilePaths(d: any, filesDir: string) {
  for (const table of ['voucher_files', 'invoice_files']) {
    let rows: Array<{ id: number; filePath: string }> = []
    try {
      rows = d.prepare(`SELECT id, file_path as filePath FROM ${table}`).all() as Array<{
        id: number
        filePath: string
      }>
    } catch {
      rows = []
    }
    for (const row of rows) {
      const baseName = path.basename(String(row.filePath || ''))
      if (!baseName) continue
      d.prepare(`UPDATE ${table} SET file_path = ? WHERE id = ?`).run(
        path.join(filesDir, baseName),
        row.id
      )
    }
  }
}

let backupBusy = false
export function assertBackupIdle() {
  if (backupBusy) throw new Error('Bitte zuerst die laufende Sicherung oder den Wechsel des Sicherungsordners abwarten.')
}
let progress: BackupProgress | null = null
export function getBackupProgress() { return progress }

function recoveryRoot() {
  const localRoot = process.platform === 'win32' ? process.env.LOCALAPPDATA || app.getPath('temp') : app.getPath('userData')
  return path.join(localRoot, 'VereinO', 'backup-recovery')
}

export async function openRecoveryFolder() {
  const dir = recoveryRoot()
  await fs.mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  return { ok: !error, error: error || undefined }
}

// Reading a configured path must never contact a potentially unavailable drive.
// In particular, a temporarily offline share must not erase the user's setting.
export function getBackupDir(): string {
  return configuredBackupDir() ?? defaultBackupDir()
}

export async function setBackupDir(dir: string | null | undefined) {
  return setBackupDirWithMigration(dir)
}

export async function setBackupDirWithMigration(dir: string | null | undefined): Promise<{
  ok: boolean; dir: string; moved: number; error?: string; warning?: string
}> {
  if (backupBusy) return { ok: false, dir: getBackupDir(), moved: 0, error: 'Eine Sicherung oder ein Ordnerwechsel läuft bereits.' }
  backupBusy = true
  try {
    const previousDir = getBackupDir()
    const targetDir = dir?.trim() || defaultBackupDir()
    await runBackupIo({ action: 'probe', dir: targetDir })
    setSetting(BACKUP_DIR_SETTING, dir?.trim() || null)
    if (pathsEqual(previousDir, targetDir)) return { ok: true, dir: targetDir, moved: 0 }
    try {
      const result = await runBackupIo({ action: 'migrate', source: previousDir, dir: targetDir })
      return { ok: true, dir: targetDir, moved: result.moved || 0 }
    } catch (error) {
      return { ok: true, dir: targetDir, moved: 0, warning: `Der neue Ordner ist gesetzt. Vorhandene Sicherungen konnten nicht vollständig kopiert werden; die Originale bleiben erhalten. ${error instanceof Error ? error.message : String(error)}` }
    }
  } catch (error) {
    return { ok: false, dir: getBackupDir(), moved: 0, error: error instanceof Error ? error.message : String(error) }
  } finally { backupBusy = false }
}

function timestamp(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}_${hh}${mm}${ss}`
}

export async function makeBackup(reason?: string): Promise<BackupResult> {
  if (backupBusy) throw new Error('Eine Sicherung oder ein Ordnerwechsel läuft bereits.')
  backupBusy = true
  let localFilePath = ''
  let localComplete = false
  let logFilePath = ''
  let logQueue = Promise.resolve()
  let lastStage = ''
  const report = (update: Omit<BackupProgress, 'active'> & { active?: boolean }) => {
    progress = { ...update, active: update.active ?? true, localFilePath: localComplete && update.stage !== 'done' ? localFilePath : undefined, logFilePath: logFilePath || undefined }
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('backup:progress', progress)
      } catch { /* A closing window must not interrupt the backup. */ }
    }
    if (logFilePath && (lastStage !== update.stage || update.stage === 'error' || update.stage === 'done')) {
      lastStage = update.stage
      const line = JSON.stringify({ time: new Date().toISOString(), ...progress }) + '\n'
      logQueue = logQueue.then(() => fs.appendFile(logFilePath, line, 'utf8')).catch(() => undefined)
    }
  }
  try {
    const dir = getBackupDir()
    // Capture the source before awaiting; a later organization switch must not mix backups.
    const database = getDb()
    const { filesDir } = getCurrentDbInfo()
    const root = recoveryRoot()
    await fs.mkdir(root, { recursive: true })
    const staging = await fs.mkdtemp(path.join(root, 'backup-'))
    logFilePath = path.join(staging, 'backup.log')
    const tag = reason ? `_${reason.replace(/[^a-zA-Z0-9_-]+/g, '_')}` : ''
    const name = `database_${timestamp()}${tag}_${randomUUID()}.sqlite`
    localFilePath = path.join(staging, name)
    await fs.writeFile(logFilePath, JSON.stringify({ time: new Date().toISOString(), targetDir: dir, reason: reason || 'manual' }) + '\n')
    report({ stage: 'database', message: 'Datenbank wird lokal gesichert …' })
    const deadline = Date.now() + 30 * 60_000
    // Never copy an open SQLite file directly: WAL transactions could be missing.
    await database.backup(`${localFilePath}.partial`, { progress: () => {
      if (Date.now() > deadline) throw new Error('Zeitüberschreitung beim Erstellen der lokalen Datenbanksicherung.')
      return 100
    } })
    report({ stage: 'attachments', message: 'Belege werden lokal gesichert …' })
    await runBackupIo({ action: 'snapshot', source: filesDir, destination: snapshotDirForBackupFile(localFilePath) }, report)
    await fs.rename(`${localFilePath}.partial`, localFilePath)
    localComplete = true
    report({ stage: 'transfer', message: 'Sicherung wird zum Zielordner übertragen …' })
    const result = await runBackupIo({ action: 'publish', source: localFilePath, dir }, report)
    if (!result.filePath) throw new Error('Die Übertragung wurde nicht bestätigt.')
    let warning: string | undefined
    report({ stage: 'rotation', message: 'Alte Sicherungen werden bereinigt …' })
    try {
      await runBackupIo({ action: 'rotate', dir, keep: 5 }, report, { idleMs: 20_000, totalMs: 60_000 })
    } catch (error) {
      warning = `Die Sicherung wurde gespeichert. Alte Sicherungen konnten nicht bereinigt werden: ${error instanceof Error ? error.message : String(error)}`
    }
    report({ active: false, stage: 'done', message: warning || `Sicherung erfolgreich gespeichert: ${result.filePath}` })
    await logQueue
    // Keep the diagnostic log, but remove the redundant local backup only after publication.
    await Promise.all([fs.unlink(localFilePath), fs.rm(snapshotDirForBackupFile(localFilePath), { recursive: true, force: true })]).catch(() => undefined)
    progress = { ...progress!, localFilePath: undefined }
    return { filePath: result.filePath, warning, logFilePath }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const message = localComplete
      ? `Die Übertragung zum Sicherungsziel ist fehlgeschlagen oder wurde nicht bestätigt. ${detail} Die vollständige lokale Sicherung bleibt erhalten: ${localFilePath}`
      : `Die Sicherung konnte nicht vollständig erstellt werden. ${detail}`
    report({ active: false, stage: 'error', message })
    await logQueue
    // Incomplete local snapshots remain marked .partial, never as restorable backups.
    throw new Error(`${message}${logFilePath ? ` Protokoll: ${logFilePath}` : ''}`)
  } finally { backupBusy = false }
}

export async function listBackups(): Promise<{ dir: string; backups: BackupEntry[] }> {
  const dir = getBackupDir()
  const result = await runBackupIo({ action: 'list', dir })
  return { dir, backups: result.files || [] }
}

export async function rotateBackups(keep = 5): Promise<void> {
  await runBackupIo({ action: 'rotate', dir: getBackupDir(), keep })
}

export async function openBackupFolder(): Promise<{ ok: boolean; error?: string | null }> {
  try {
    const dir = getBackupDir()
    const res = await shell.openPath(dir)
    return { ok: !res, error: res || null }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

function openDbAt(filePath: string): any {
  const d: any = new (require('better-sqlite3'))(filePath)
  d.pragma('foreign_keys = ON')
  return d
}

function closeSqlite(db: any) {
  try {
    db?.close?.()
  } catch {
    /* ignore */
  }
}

function countInspectionTables(db: any): BackupCounts {
  const counts: BackupCounts = {}
  for (const table of INSPECTION_TABLES) {
    try {
      counts[table] = Number(db.prepare(`SELECT COUNT(1) AS n FROM ${table}`).get().n || 0)
    } catch {
      /* ignore missing table */
    }
  }
  return counts
}

function readLastActivity(db: any): BackupLastActivity {
  const last: BackupLastActivity = {}
  for (const [key, query] of Object.entries(LAST_ACTIVITY_QUERIES) as Array<
    [keyof BackupLastActivity, string]
  >) {
    try {
      last[key] = (db.prepare(query).get() as any)?.v ?? null
    } catch {
      last[key] = null
    }
  }
  return last
}

function inspectDbFile(filePath: string, includeLastActivity: boolean) {
  let db: any = null
  try {
    db = openDbAt(filePath)
    const counts = countInspectionTables(db)
    return includeLastActivity
      ? { ok: true as const, counts, last: readLastActivity(db) }
      : { ok: true as const, counts }
  } catch (e: any) {
    return { ok: false as const, error: e?.message || String(e) }
  } finally {
    closeSqlite(db)
  }
}

export function inspectBackup(filePath: string): {
  ok: boolean
  counts?: Record<string, number>
  error?: string
} {
  return inspectDbFile(filePath, false)
}

export function inspectCurrent(): { ok: boolean; counts?: Record<string, number>; error?: string } {
  try {
    const { dbPath } = getCurrentDbInfo()
    return inspectBackup(dbPath)
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export function inspectBackupDetailed(filePath: string): {
  ok: boolean
  counts?: Record<string, number>
  last?: BackupLastActivity
  error?: string
} {
  return inspectDbFile(filePath, true)
}

export async function restoreBackup(filePath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { dbPath, filesDir } = getCurrentDbInfo()
    const snapshotDir = snapshotDirForBackupFile(filePath)
    try {
      closeDb()
    } catch {
      /* ignore */
    }

    await fs.copyFile(filePath, dbPath)
    ensureDir(filesDir)
    if (await pathExists(snapshotDir)) {
      await clearDirContents(filesDir)
      await copyDirRecursive(snapshotDir, filesDir)
    }

    const d = getDb()
    try {
      applyMigrations(d as any)
    } catch {
      /* ignore */
    }
    try {
      relinkFilePaths(d, filesDir)
    } catch {
      /* ignore */
    }
    d.pragma('foreign_keys = ON')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
