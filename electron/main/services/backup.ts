import fs from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { getSetting, setSetting } from './settings'
import { getAppDataDir, getCurrentDbInfo, getDb, closeDb } from '../db/database'
import { applyMigrations } from '../db/migrations'
import { isUsableBackupDirectory, resolveBackupDirectory } from './backupDirectory'

export type BackupEntry = { filePath: string; size: number; mtime: number }
type BackupCounts = Record<string, number>
type BackupLastActivity = {
  voucher?: string | null
  invoice?: string | null
  member?: string | null
  audit?: string | null
}

const BACKUP_DIR_SETTING = 'backup.dir'
const BACKUP_FILE_PATTERN = /\.sqlite$/i
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
  fs.mkdirSync(dir, { recursive: true })
}

function removeFileIfExists(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

function removeDirIfExists(dir: string) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath)
    else if (entry.isFile()) fs.copyFileSync(srcPath, destPath)
  }
}

function clearDirContents(dir: string) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    fs.rmSync(full, { recursive: true, force: true })
  }
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

function applyBackupDirSetting(dir: string | null | undefined) {
  if (dir && String(dir).trim()) {
    const value = String(dir).trim()
    if (!isUsableBackupDirectory(value))
      throw new Error(`Der Backup-Ordner ist nicht beschreibbar: ${value}`)
    setSetting(BACKUP_DIR_SETTING, value)
    return value
  }

  const fallback = defaultBackupDir()
  try {
    ensureDir(fallback)
  } catch {
    /* fallback may still be created lazily by directory resolution */
  }
  setSetting(BACKUP_DIR_SETTING, null)
  return fallback
}

function migrateBackupFiles(sourceDir: string, targetDir: string) {
  if (pathsEqual(sourceDir, targetDir)) return 0

  let moved = 0
  try {
    const files = fs.existsSync(sourceDir) ? fs.readdirSync(sourceDir) : []
    for (const fileName of files) {
      if (!BACKUP_FILE_PATTERN.test(fileName)) continue
      const sourceFile = path.join(sourceDir, fileName)
      const targetFile = path.join(targetDir, fileName)
      try {
        if (fs.existsSync(targetFile)) continue
        fs.copyFileSync(sourceFile, targetFile)
        const sourceSnapshot = snapshotDirForBackupFile(sourceFile)
        const targetSnapshot = snapshotDirForBackupFile(targetFile)
        if (fs.existsSync(sourceSnapshot) && !fs.existsSync(targetSnapshot))
          copyDirRecursive(sourceSnapshot, targetSnapshot)
        moved += 1
      } catch {
        /* skip individual files */
      }
    }
  } catch {
    /* ignore directory-level migration failures */
  }
  return moved
}

export function getBackupDir(): string {
  const resolution = resolveBackupDirectory(configuredBackupDir(), defaultBackupDir())
  if (resolution.usedFallback) {
    // Repair stale paths, for example after moving a database from another
    // Windows user profile or disconnecting an external drive.
    try {
      setSetting(BACKUP_DIR_SETTING, null)
    } catch {
      /* fallback remains usable for this run */
    }
  }
  return resolution.dir
}

export function setBackupDir(dir: string | null | undefined): { ok: boolean; dir: string } {
  try {
    applyBackupDirSetting(dir)
    return { ok: true, dir: getBackupDir() }
  } catch {
    return { ok: false, dir: getBackupDir() }
  }
}

/**
 * Change backup directory and migrate existing backups from the previously effective directory
 * to the new one. Copies only .sqlite files. If a file with the same name already exists
 * in the target directory, it will be skipped to avoid overwriting.
 */
export function setBackupDirWithMigration(dir: string | null | undefined): {
  ok: boolean
  dir: string
  moved: number
} {
  try {
    const previousDir = configuredBackupDir() ?? defaultBackupDir()
    const targetDir = applyBackupDirSetting(dir)
    return { ok: true, dir: targetDir, moved: migrateBackupFiles(previousDir, targetDir) }
  } catch {
    return { ok: false, dir: getBackupDir(), moved: 0 }
  }
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

export async function makeBackup(reason?: string): Promise<{ filePath: string }> {
  const dir = getBackupDir()
  const stamp = timestamp()
  const tag = reason ? `_${reason.replace(/[^a-zA-Z0-9_-]+/g, '_')}` : ''
  const out = path.join(dir, `database_${stamp}${tag}.sqlite`)
  const snapshotDir = snapshotDirForBackupFile(out)
  // Use better-sqlite3 online backup for a consistent copy while DB is open
  const d: any = getDb()
  try {
    if (typeof d.backup === 'function') {
      await d.backup(out)
    } else {
      // Fallback: copy file directly (less safe with WAL but better than nothing)
      const { dbPath } = getCurrentDbInfo()
      fs.copyFileSync(dbPath, out)
    }
    const { filesDir } = getCurrentDbInfo()
    if (fs.existsSync(snapshotDir)) fs.rmSync(snapshotDir, { recursive: true, force: true })
    copyDirRecursive(filesDir, snapshotDir)
  } catch (e) {
    // If backup failed, ensure file does not remain as a partial
    removeFileIfExists(out)
    removeDirIfExists(snapshotDir)
    throw e
  }
  try {
    await rotateBackups()
  } catch {
    /* ignore rotation errors */
  }
  return { filePath: out }
}

export function listBackups(): { dir: string; backups: BackupEntry[] } {
  const dir = getBackupDir()
  const entries: BackupEntry[] = []
  try {
    const files = fs.readdirSync(dir)
    for (const f of files) {
      if (!BACKUP_FILE_PATTERN.test(f)) continue
      const full = path.join(dir, f)
      try {
        const st = fs.statSync(full)
        if (st.isFile()) entries.push({ filePath: full, size: st.size, mtime: st.mtimeMs })
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  entries.sort((a, b) => b.mtime - a.mtime)
  return { dir, backups: entries }
}

// Simple rotation: keep the most recent backup files; delete older ones.
export async function rotateBackups(keep: number = 5): Promise<void> {
  const { backups } = listBackups()
  if (backups.length <= keep) return
  for (const backup of backups.slice(keep)) {
    removeFileIfExists(backup.filePath)
    removeDirIfExists(snapshotDirForBackupFile(backup.filePath))
  }
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

export function getDefaultDbInfo() {
  const root = app.getPath('userData')
  const filesDir = path.join(root, 'files')
  const dbPath = path.join(root, 'database.sqlite')
  return { root, filesDir, dbPath }
}

export function inspectBackupDetailed(filePath: string): {
  ok: boolean
  counts?: Record<string, number>
  last?: BackupLastActivity
  error?: string
} {
  return inspectDbFile(filePath, true)
}

export function restoreBackup(filePath: string): { ok: boolean; error?: string } {
  try {
    const { dbPath, filesDir } = getCurrentDbInfo()
    const snapshotDir = snapshotDirForBackupFile(filePath)
    try {
      closeDb()
    } catch {
      /* ignore */
    }

    fs.copyFileSync(filePath, dbPath)
    ensureDir(filesDir)
    if (fs.existsSync(snapshotDir)) {
      clearDirContents(filesDir)
      copyDirRecursive(snapshotDir, filesDir)
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
