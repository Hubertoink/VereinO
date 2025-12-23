import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const require = createRequire(import.meta.url)
let BetterSqlite3: any
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BetterSqlite3 = require('better-sqlite3')
} catch (e) {
    BetterSqlite3 = null
}

export function getAppDataDir() {
    let root = getConfiguredRoot()
    try {
        if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
    } catch {
        // Fallback: configured root ist nicht verfügbar (z. B. Netzwerklaufwerk entfernt)
        // Verwende den Standard-App-Datenordner, damit der Prozess nicht abstürzt.
        root = app.getPath('userData')
        try { if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true }) } catch { /* last resort: ignore, other calls will throw with clearer errors */ }
    }
    const filesDir = path.join(root, 'files')
    try {
        if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    } catch {
        // Wenn selbst der files-Ordner nicht angelegt werden kann, belasse ihn als Pfad;
        // nachgelagerte Funktionen behandeln dies und liefern verständlichere Fehlermeldungen.
    }
    return { root, filesDir }
}

type DB = any
let db: DB | undefined

// Simple app-level JSON config (outside DB) to remember custom DB location
type AppConfig = { 
    dbRoot?: string
    activeOrgId?: string
    organizations?: Array<{
        id: string
        name: string
        dbRoot: string
        createdAt: string
        colorTheme?: string
        backgroundImage?: string
        glassModals?: boolean
    }>
}
function getConfigPath() {
    const ud = app.getPath('userData')
    if (!fs.existsSync(ud)) fs.mkdirSync(ud, { recursive: true })
    return path.join(ud, 'config.json')
}
export function readAppConfig(): AppConfig {
    try {
        const p = getConfigPath()
        if (!fs.existsSync(p)) return {}
        const raw = fs.readFileSync(p, 'utf8')
        return JSON.parse(raw) as AppConfig
    } catch { return {} }
}
export function writeAppConfig(cfg: AppConfig) {
    const p = getConfigPath()
    try { fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8') } catch { }
}
export function getConfiguredRoot(): string {
    const cfg = readAppConfig()
    return (cfg.dbRoot && typeof cfg.dbRoot === 'string' && cfg.dbRoot.trim()) ? cfg.dbRoot : app.getPath('userData')
}
export function getCurrentDbInfo() {
    const { root, filesDir } = getAppDataDir()
    const dbPath = path.join(root, 'database.sqlite')
    return { root, filesDir, dbPath }
}

export function getDb(): DB {
    if (db) return db
    if (!BetterSqlite3) {
        throw new Error(
            'better-sqlite3 native bindings konnten nicht geladen werden.\n' +
            'Stelle sicher, dass die Abhängigkeit für die Electron-Version neu gebaut wurde.\n\n' +
            'Schritte (Windows):\n' +
            '1) Installiere Visual Studio 2022 mit dem Workload "Desktopentwicklung mit C++" inkl. ARM64 (falls ARM-Gerät).\n' +
            '2) Stelle sicher, dass Python 3 installiert ist und in PATH liegt.\n' +
            '3) Führe im Projektordner aus: npm run rebuild:native\n' +
            '4) Starte die App neu.'
        )
    }
    const { root } = getAppDataDir()
    const dbPath = path.join(root, 'database.sqlite')
    db = new BetterSqlite3(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    return db
}

export function withTransaction<T>(fn: (db: DB) => T): T {
    const d = getDb()
    const trx = d.transaction(() => fn(d))
    return trx()
}

export function closeDb() {
    if (db) {
        db.close()
        db = undefined
    }
}

// Migrate database and attachments to a new root directory.
// mode: 'use' -> just switch to the folder (expects a database.sqlite there), no copy
//       'copy-overwrite' -> copy current DB and attachments to new root; rewrite attachment file paths
export function migrateToRoot(newRoot: string, mode: 'use' | 'copy-overwrite' = 'copy-overwrite') {
    if (!newRoot || typeof newRoot !== 'string') throw new Error('Ungültiger Zielordner')
    const normalizedTarget = path.resolve(newRoot)
    if (!fs.existsSync(normalizedTarget)) fs.mkdirSync(normalizedTarget, { recursive: true })
    const dstRoot = normalizedTarget
    const dstFilesDir = path.join(dstRoot, 'files')
    if (!fs.existsSync(dstFilesDir)) fs.mkdirSync(dstFilesDir, { recursive: true })
    const dstDbPath = path.join(dstRoot, 'database.sqlite')

    // Close current DB so OS file locks are released
    try { closeDb() } catch { }

    if (mode === 'use') {
        // Use existing folder: do not depend on current root availability
        if (!fs.existsSync(dstDbPath)) throw new Error('Im gewählten Ordner wurde keine database.sqlite gefunden')
        writeAppConfig({ ...readAppConfig(), dbRoot: dstRoot })
        return { root: dstRoot, dbPath: dstDbPath, filesDir: dstFilesDir }
    }

    // copy-overwrite requires access to current DB as source
    let srcRoot = ''
    let srcDbPath = ''
    let srcFilesDir = ''
    try {
        const currentInfo = getCurrentDbInfo()
        srcRoot = currentInfo.root
        srcDbPath = currentInfo.dbPath
        srcFilesDir = currentInfo.filesDir
    } catch (e: any) {
        throw new Error('Aktueller Speicherort ist nicht verfügbar. Verwende bitte "Bestehende verwenden" oder setze auf Standard zurück.')
    }

    // copy-overwrite: copy DB file
    try { fs.copyFileSync(srcDbPath, dstDbPath) } catch (e) { throw new Error('Kopieren der Datenbank fehlgeschlagen: ' + (e as any)?.message) }

    // Try to update attachment paths inside the copied DB and copy files
    try {
        const d = new BetterSqlite3(dstDbPath)
        d.pragma('journal_mode = WAL')
        const rows = d.prepare('SELECT id, file_path FROM voucher_files').all() as Array<{ id: number; file_path: string }>
        for (const r of rows) {
            const baseName = path.basename(r.file_path)
            const src = path.join(srcFilesDir, baseName)
            const dst = path.join(dstFilesDir, baseName)
            try {
                if (fs.existsSync(src)) fs.copyFileSync(src, dst)
            } catch { /* ignore */ }
            d.prepare('UPDATE voucher_files SET file_path = ? WHERE id = ?').run(dst, r.id)
        }
        d.close()
    } catch (e) {
        throw new Error('Migration der Anhänge fehlgeschlagen: ' + (e as any)?.message)
    }

    // Persist new root in config
    writeAppConfig({ ...readAppConfig(), dbRoot: dstRoot })

    return { root: dstRoot, dbPath: dstDbPath, filesDir: dstFilesDir }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Organization Support
// ─────────────────────────────────────────────────────────────────────────────

function generateOrgId(): string {
    return 'org_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * List all organizations from the app config.
 * If no organizations exist, returns the current DB as a "default" organization.
 */
export function listOrganizations(): Array<{ id: string; name: string; dbRoot: string; createdAt: string; isActive: boolean }> {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const activeId = cfg.activeOrgId
    
    // If no orgs defined, create a virtual entry for the current DB
    if (orgs.length === 0) {
        const currentRoot = getConfiguredRoot()
        return [{
            id: 'default',
            name: 'Standard',
            dbRoot: currentRoot,
            createdAt: new Date().toISOString(),
            isActive: true
        }]
    }
    
    return orgs.map(o => ({ ...o, isActive: o.id === activeId }))
}

/**
 * Get the currently active organization
 */
export function getActiveOrganization(): { id: string; name: string; dbRoot: string; createdAt: string } | null {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const activeId = cfg.activeOrgId || 'default'
    
    if (orgs.length === 0) {
        const currentRoot = getConfiguredRoot()
        return { id: 'default', name: 'Standard', dbRoot: currentRoot, createdAt: new Date().toISOString() }
    }
    
    return orgs.find(o => o.id === activeId) || orgs[0] || null
}

/**
 * Create a new organization with its own database folder.
 * The folder is created under userData/organizations/<id>/
 */
export function createOrganization(name: string): { id: string; name: string; dbRoot: string; createdAt: string } {
    if (!name || typeof name !== 'string' || !name.trim()) {
        throw new Error('Organisationsname ist erforderlich')
    }
    
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    
    // Migrate existing DB to first org if this is the first creation
    if (orgs.length === 0 && cfg.dbRoot !== undefined) {
        // There's already a DB in use - create a "default" entry for it
        const currentRoot = getConfiguredRoot()
        const defaultOrg = {
            id: 'default',
            name: 'Standard',
            dbRoot: currentRoot,
            createdAt: new Date().toISOString()
        }
        orgs.push(defaultOrg)
    } else if (orgs.length === 0) {
        // No orgs yet and using default userData - create entry for it
        const currentRoot = app.getPath('userData')
        const defaultOrg = {
            id: 'default',
            name: 'Standard',
            dbRoot: currentRoot,
            createdAt: new Date().toISOString()
        }
        orgs.push(defaultOrg)
    }
    
    const id = generateOrgId()
    const orgsFolder = path.join(app.getPath('userData'), 'organizations')
    if (!fs.existsSync(orgsFolder)) fs.mkdirSync(orgsFolder, { recursive: true })
    
    const orgRoot = path.join(orgsFolder, id)
    fs.mkdirSync(orgRoot, { recursive: true })
    
    // Create files subfolder
    const filesDir = path.join(orgRoot, 'files')
    fs.mkdirSync(filesDir, { recursive: true })
    
    const newOrg = {
        id,
        name: name.trim(),
        dbRoot: orgRoot,
        createdAt: new Date().toISOString()
    }
    
    orgs.push(newOrg)
    writeAppConfig({ ...cfg, organizations: orgs })
    
    return newOrg
}

/**
 * Switch to a different organization.
 * Closes current DB and updates config. Caller should reload the app/window.
 */
export function switchOrganization(orgId: string): { success: boolean; org: { id: string; name: string; dbRoot: string } } {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    
    // Handle default org case
    if (orgId === 'default' && orgs.length === 0) {
        closeDb()
        const defaultRoot = app.getPath('userData')
        writeAppConfig({ ...cfg, activeOrgId: 'default', dbRoot: defaultRoot })
        return { success: true, org: { id: 'default', name: 'Standard', dbRoot: defaultRoot } }
    }
    
    const org = orgs.find(o => o.id === orgId)
    if (!org) throw new Error('Organisation nicht gefunden')
    
    // Close current DB
    closeDb()
    
    // Update config
    writeAppConfig({ ...cfg, activeOrgId: orgId, dbRoot: org.dbRoot })
    
    return { success: true, org }
}

/**
 * Rename an organization
 */
export function renameOrganization(orgId: string, newName: string): { success: boolean } {
    if (!newName || !newName.trim()) throw new Error('Name ist erforderlich')
    
    const cfg = readAppConfig()
    let orgs = cfg.organizations || []
    
    // Handle default org when no organizations are formally defined
    if (orgId === 'default' && orgs.length === 0) {
        // Create a formal entry for the default org with the new name
        const currentRoot = getConfiguredRoot()
        const defaultOrg = {
            id: 'default',
            name: newName.trim(),
            dbRoot: currentRoot,
            createdAt: new Date().toISOString()
        }
        orgs = [defaultOrg]
        writeAppConfig({ ...cfg, organizations: orgs, activeOrgId: 'default' })
        return { success: true }
    }
    
    const idx = orgs.findIndex(o => o.id === orgId)
    if (idx === -1) throw new Error('Organisation nicht gefunden')
    
    orgs[idx] = { ...orgs[idx], name: newName.trim() }
    writeAppConfig({ ...cfg, organizations: orgs })
    
    return { success: true }
}

/**
 * Delete an organization and optionally its data.
 * Cannot delete the last organization or the currently active one.
 */
export function deleteOrganization(orgId: string, deleteData: boolean = false): { success: boolean } {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    
    if (orgs.length <= 1) throw new Error('Die letzte Organisation kann nicht gelöscht werden')
    if (cfg.activeOrgId === orgId) throw new Error('Die aktive Organisation kann nicht gelöscht werden. Wechsle zuerst zu einer anderen.')
    
    const org = orgs.find(o => o.id === orgId)
    if (!org) throw new Error('Organisation nicht gefunden')
    
    // Remove from list
    const newOrgs = orgs.filter(o => o.id !== orgId)
    writeAppConfig({ ...cfg, organizations: newOrgs })
    
    // Optionally delete data folder
    if (deleteData && org.dbRoot) {
        try {
            fs.rmSync(org.dbRoot, { recursive: true, force: true })
        } catch (e) {
            console.warn('Could not delete org folder:', e)
        }
    }
    
    return { success: true }
}

/**
 * Get the appearance settings for a specific organization
 */
export function getOrganizationAppearance(orgId: string): { colorTheme: string | null; backgroundImage: string | null; glassModals: boolean } {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const org = orgs.find(o => o.id === orgId)
    return {
        colorTheme: org?.colorTheme || null,
        backgroundImage: org?.backgroundImage || null,
        glassModals: org?.glassModals ?? false
    }
}

/**
 * Set the appearance settings for a specific organization
 */
export function setOrganizationAppearance(
    orgId: string, 
    appearance: { colorTheme?: string; backgroundImage?: string; glassModals?: boolean }
): { success: boolean } {
    const cfg = readAppConfig()
    let orgs = cfg.organizations || []
    
    // Ensure the default org exists in the array if we're setting its appearance
    if (orgs.length === 0) {
        const currentRoot = getConfiguredRoot()
        orgs = [{
            id: 'default',
            name: 'Standard',
            dbRoot: currentRoot,
            createdAt: new Date().toISOString(),
            colorTheme: undefined,
            backgroundImage: undefined,
            glassModals: undefined
        }]
    }
    
    const idx = orgs.findIndex(o => o.id === orgId)
    
    if (idx === -1) {
        // If org doesn't exist yet (e.g., default), create it
        if (orgId === 'default') {
            const currentRoot = getConfiguredRoot()
            orgs.push({
                id: 'default',
                name: 'Standard',
                dbRoot: currentRoot,
                createdAt: new Date().toISOString(),
                colorTheme: appearance.colorTheme,
                backgroundImage: appearance.backgroundImage,
                glassModals: appearance.glassModals
            })
        } else {
            throw new Error('Organisation nicht gefunden')
        }
    } else {
        orgs[idx] = { 
            ...orgs[idx], 
            ...(appearance.colorTheme !== undefined && { colorTheme: appearance.colorTheme }),
            ...(appearance.backgroundImage !== undefined && { backgroundImage: appearance.backgroundImage }),
            ...(appearance.glassModals !== undefined && { glassModals: appearance.glassModals })
        }
    }
    
    writeAppConfig({ ...cfg, organizations: orgs, activeOrgId: cfg.activeOrgId || 'default' })
    return { success: true }
}

/**
 * Get the appearance settings (theme, background, glass) of the currently active organization
 */
export function getActiveOrganizationAppearance(): { colorTheme: string | null; backgroundImage: string | null; glassModals: boolean } {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const activeId = cfg.activeOrgId
    
    // If orgs array is empty, return defaults
    if (orgs.length === 0) {
        return { colorTheme: null, backgroundImage: null, glassModals: false }
    }
    
    // Find active org
    const activeOrg = orgs.find(o => o.id === activeId) || orgs[0]
    return {
        colorTheme: activeOrg?.colorTheme || null,
        backgroundImage: activeOrg?.backgroundImage || null,
        glassModals: activeOrg?.glassModals ?? false
    }
}
