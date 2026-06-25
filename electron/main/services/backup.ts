import fs from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { getSetting, setSetting } from './settings'
import { getAppDataDir, getCurrentDbInfo, getDb, closeDb } from '../db/database'
import { applyMigrations } from '../db/migrations'

export type BackupEntry = { filePath: string; size: number; mtime: number }

function snapshotDirForBackupFile(filePath: string) {
    return filePath.replace(/\.sqlite$/i, '.files')
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
            rows = d.prepare(`SELECT id, file_path as filePath FROM ${table}`).all() as Array<{ id: number; filePath: string }>
        } catch {
            rows = []
        }
        for (const row of rows) {
            const baseName = path.basename(String(row.filePath || ''))
            if (!baseName) continue
            d.prepare(`UPDATE ${table} SET file_path = ? WHERE id = ?`).run(path.join(filesDir, baseName), row.id)
        }
    }
}

export function getBackupDir(): string {
    // Allow user-defined backup directory via settings key 'backup.dir'
    const cfg = getSetting<string>('backup.dir')
    const effective = (cfg && typeof cfg === 'string' && cfg.trim()) ? cfg.trim() : path.join(getAppDataDir().root, 'backups')
    const dir = effective
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
    return dir
}

export function setBackupDir(dir: string | null | undefined): { ok: boolean; dir: string } {
    try {
        if (dir && String(dir).trim()) {
            const val = String(dir).trim()
            try { if (!fs.existsSync(val)) fs.mkdirSync(val, { recursive: true }) } catch { /* ignore */ }
            setSetting('backup.dir', val)
        } else {
            // Reset to default by clearing setting
            setSetting('backup.dir', null)
        }
        const eff = getBackupDir()
        return { ok: true, dir: eff }
    } catch (e) {
        return { ok: false, dir: getBackupDir() }
    }
}

/**
 * Change backup directory and migrate existing backups from the previously effective directory
 * to the new one. Copies only .sqlite files. If a file with the same name already exists
 * in the target directory, it will be skipped to avoid overwriting.
 */
export function setBackupDirWithMigration(dir: string | null | undefined): { ok: boolean; dir: string; moved: number } {
    try {
        // Determine previous effective directory exactly like getBackupDir()
        const prevCfg = getSetting<string>('backup.dir')
        const prevEff = (prevCfg && typeof prevCfg === 'string' && prevCfg.trim())
            ? prevCfg.trim()
            : path.join(getAppDataDir().root, 'backups')

        // Apply new configuration
        let targetEff: string
        if (dir && String(dir).trim()) {
            const val = String(dir).trim()
            try { if (!fs.existsSync(val)) fs.mkdirSync(val, { recursive: true }) } catch { /* ignore */ }
            setSetting('backup.dir', val)
            targetEff = val
        } else {
            // Reset to default
            const def = path.join(getAppDataDir().root, 'backups')
            try { if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true }) } catch { /* ignore */ }
            setSetting('backup.dir', null)
            targetEff = def
        }

        // If the same (normalized) path, nothing to migrate
        const same = path.resolve(prevEff).toLowerCase() === path.resolve(targetEff).toLowerCase()
        let moved = 0
        if (!same) {
            try {
                const files = fs.existsSync(prevEff) ? fs.readdirSync(prevEff) : []
                for (const f of files) {
                    if (!/\.sqlite$/i.test(f)) continue
                    const src = path.join(prevEff, f)
                    const dest = path.join(targetEff, f)
                    try {
                        if (!fs.existsSync(dest)) {
                            fs.copyFileSync(src, dest)
                            const srcSnapshot = snapshotDirForBackupFile(src)
                            const destSnapshot = snapshotDirForBackupFile(dest)
                            if (fs.existsSync(srcSnapshot) && !fs.existsSync(destSnapshot)) copyDirRecursive(srcSnapshot, destSnapshot)
                            moved += 1
                        }
                    } catch { /* skip individual errors */ }
                }
            } catch { /* ignore */ }
        }

        return { ok: true, dir: targetEff, moved }
    } catch (e) {
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
        try { if (fs.existsSync(out)) fs.unlinkSync(out) } catch { /* ignore */ }
        try { if (fs.existsSync(snapshotDir)) fs.rmSync(snapshotDir, { recursive: true, force: true }) } catch { /* ignore */ }
        throw e
    }
    try { await rotateBackups() } catch { /* ignore rotation errors */ }
    return { filePath: out }
}

export function listBackups(): { dir: string; backups: BackupEntry[] } {
    const dir = getBackupDir()
    const entries: BackupEntry[] = []
    try {
        const files = fs.readdirSync(dir)
        for (const f of files) {
            if (!/\.sqlite$/i.test(f)) continue
            const full = path.join(dir, f)
            try {
                const st = fs.statSync(full)
                if (st.isFile()) entries.push({ filePath: full, size: st.size, mtime: st.mtimeMs })
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    entries.sort((a, b) => b.mtime - a.mtime)
    return { dir, backups: entries }
}

// Simple rotation: keep max 7 most recent daily backups; delete older ones
export async function rotateBackups(keep: number = 5): Promise<void> {
    const { backups } = listBackups()
    if (backups.length <= keep) return
    const toDelete = backups.slice(keep)
    for (const b of toDelete) {
        try { fs.unlinkSync(b.filePath) } catch { /* ignore */ }
        try {
            const snapshotDir = snapshotDirForBackupFile(b.filePath)
            if (fs.existsSync(snapshotDir)) fs.rmSync(snapshotDir, { recursive: true, force: true })
        } catch { /* ignore */ }
    }
}

export async function openBackupFolder(): Promise<{ ok: boolean; error?: string | null }> {
    try {
        const dir = getBackupDir()
        const res = await shell.openPath(dir)
        return { ok: !res, error: res || null }
    } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

function openDbAt(filePath: string): any {
    const d: any = new (require('better-sqlite3'))(filePath)
    d.pragma('foreign_keys = ON')
    return d
}

export function inspectBackup(filePath: string): { ok: boolean; counts?: Record<string, number>; error?: string } {
    try {
        const d = openDbAt(filePath)
        const counts: Record<string, number> = {}
        const tables = ['vouchers', 'invoice_files', 'invoices', 'voucher_files', 'members', 'tags']
        for (const t of tables) {
            try { counts[t] = Number(d.prepare(`SELECT COUNT(1) AS n FROM ${t}`).get().n || 0) } catch { /* ignore missing table */ }
        }
        try { d.close() } catch { }
        return { ok: true, counts }
    } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

export function inspectCurrent(): { ok: boolean; counts?: Record<string, number>; error?: string } {
    try {
        const { dbPath } = getCurrentDbInfo()
        return inspectBackup(dbPath)
    } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

export function getDefaultDbInfo() {
    const root = app.getPath('userData')
    const filesDir = path.join(root, 'files')
    const dbPath = path.join(root, 'database.sqlite')
    return { root, filesDir, dbPath }
}

export function inspectBackupDetailed(filePath: string): { ok: boolean; counts?: Record<string, number>; last?: { voucher?: string | null; invoice?: string | null; member?: string | null; audit?: string | null }; error?: string } {
    try {
        const d = openDbAt(filePath)
        const counts: Record<string, number> = {}
        const tables = ['vouchers', 'invoice_files', 'invoices', 'voucher_files', 'members', 'tags']
        for (const t of tables) {
            try { counts[t] = Number(d.prepare(`SELECT COUNT(1) AS n FROM ${t}`).get().n || 0) } catch { /* ignore */ }
        }
        const last: { voucher?: string | null; invoice?: string | null; member?: string | null; audit?: string | null } = {}
        try { last.voucher = (d.prepare('SELECT MAX(date) AS v FROM vouchers').get() as any)?.v ?? null } catch { last.voucher = null }
        try { last.invoice = (d.prepare('SELECT MAX(date) AS v FROM invoices').get() as any)?.v ?? null } catch { last.invoice = null }
        try { last.member = (d.prepare('SELECT MAX(created_at) AS v FROM members').get() as any)?.v ?? null } catch { last.member = null }
        try { last.audit = (d.prepare('SELECT MAX(created_at) AS v FROM audit_log').get() as any)?.v ?? null } catch { last.audit = null }
        try { d.close() } catch { }
        return { ok: true, counts, last }
    } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

export function restoreBackup(filePath: string): { ok: boolean; error?: string } {
    try {
        const { dbPath, filesDir } = getCurrentDbInfo()
        const snapshotDir = snapshotDirForBackupFile(filePath)
        // Pre-backup current DB
        try { /* best-effort */ } finally { }
        // Close current DB
        try { closeDb() } catch { }
        // Copy selected backup over current
        fs.copyFileSync(filePath, dbPath)
        fs.mkdirSync(filesDir, { recursive: true })
        if (fs.existsSync(snapshotDir)) {
            clearDirContents(filesDir)
            copyDirRecursive(snapshotDir, filesDir)
        }
        // Reopen + migrations
        const d = getDb()
        try { applyMigrations(d as any) } catch { /* ignore */ }
        try { relinkFilePaths(d, filesDir) } catch { /* ignore */ }
        d.pragma('foreign_keys = ON')
        return { ok: true }
    } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}
