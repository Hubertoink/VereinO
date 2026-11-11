import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

import { deleteOrganizationStorage } from './organizationDeletion'
import { copyOrganizationStorage, validateOrganizationStorageTarget } from './organizationStorage'
import type { OrganizationProfile } from '../../../shared/classification'

const require = createRequire(import.meta.url)
let BetterSqlite3: any
try {
    BetterSqlite3 = require('better-sqlite3')
} catch (e) {
    BetterSqlite3 = null
}

export function getAppDataDir() {
    assertStorageMoveIdle()
    const root = getConfiguredRoot()
    // An unavailable organization folder must never fall back to another DB.
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
    const filesDir = path.join(root, 'files')
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    return { root, filesDir }
}

type DB = any
let db: DB | undefined
let storageMoveBusy = false
export function assertStorageMoveIdle() {
    if (storageMoveBusy) throw new Error('Der Speicherort wird gerade geändert. Bitte warte, bis der Vorgang abgeschlossen ist.')
}

// Simple app-level JSON config (outside DB) to remember custom DB location
type AppConfig = {
    dbRoot?: string
    lastRunVersion?: string
    activeOrgId?: string
    organizations?: Array<{
        id: string
        name: string
        dbRoot: string
        createdAt: string
        profile?: OrganizationProfile
        colorTheme?: string
        backgroundImage?: string
        backgroundImageVisibility?: number
        customBackgroundImage?: string
        glassModals?: boolean
        bookingView?: 'classic' | 'plus'
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
function getConfiguredRoot(): string {
    const cfg = readAppConfig()
    const org = cfg.organizations?.find(item => item.id === cfg.activeOrgId) || cfg.organizations?.[0]
    if (org) return org.dbRoot
    return (cfg.dbRoot && typeof cfg.dbRoot === 'string' && cfg.dbRoot.trim()) ? cfg.dbRoot : app.getPath('userData')
}
export function getCurrentDbInfo() {
    const { root, filesDir } = getAppDataDir()
    const dbPath = path.join(root, 'database.sqlite')
    return { root, filesDir, dbPath }
}

export function getDb(): DB {
    assertStorageMoveIdle()
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

// Relocate only the selected organization; existing databases are never adopted
// or overwritten by this operation.
export async function migrateToRoot(newRoot: string, expectedOrgId: string) {
    assertStorageMoveIdle()
    const org = getActiveOrganization()
    if (!org || org.id !== expectedOrgId) throw new Error('Die Organisation wurde inzwischen gewechselt. Bitte den Zielordner erneut auswählen.')
    const source = getDb()
    const wasQueryOnly = source.pragma('query_only', { simple: true })
    source.pragma('query_only = ON')
    storageMoveBusy = true
    try {
        const target = await validateOrganizationStorageTarget(newRoot, org, listOrganizations())
        const result = await copyOrganizationStorage({
            sourceRoot: org.dbRoot, targetRoot: target, database: source,
            openDatabase: filename => new BetterSqlite3(filename),
        })
        const cfg = readAppConfig()
        if (getActiveOrganization()?.id !== expectedOrgId) throw new Error('Die Organisation wurde während des Kopierens gewechselt.')
        const next: AppConfig = {
            ...cfg, activeOrgId: org.id, dbRoot: target,
            organizations: cfg.organizations?.length
                ? cfg.organizations.map(item => item.id === org.id ? { ...item, dbRoot: target } : item)
                : [{ ...org, dbRoot: target }],
        }
        // Unlike legacy best-effort config writes, failures must be reported.
        // Commit atomically after the complete copy has been verified.
        const configPath = getConfigPath()
        const temporary = `${configPath}.storage-move.tmp`
        fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8')
        fs.renameSync(temporary, configPath)
        closeDb()
        return result
    } finally {
        if (source.open) source.pragma(`query_only = ${wasQueryOnly ? 'ON' : 'OFF'}`)
        storageMoveBusy = false
    }
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
export function listOrganizations(): Array<{ id: string; name: string; dbRoot: string; createdAt: string; profile?: OrganizationProfile; isActive: boolean }> {
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
export function getActiveOrganization(): { id: string; name: string; dbRoot: string; createdAt: string; profile?: OrganizationProfile } | null {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const activeId = cfg.activeOrgId || 'default'

    if (orgs.length === 0) {
        const currentRoot = getConfiguredRoot()
        return { id: 'default', name: 'Standard', dbRoot: currentRoot, createdAt: new Date().toISOString() }
    }

    return orgs.find(o => o.id === activeId) || orgs[0] || null
}

/** Persist the selected profile alongside the organization directory metadata. */
export function setOrganizationConfigProfile(orgId: string, profile: OrganizationProfile): void {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const index = orgs.findIndex((org) => org.id === orgId)
    if (index === -1) throw new Error('Organisation nicht gefunden')
    orgs[index] = { ...orgs[index], profile }
    writeAppConfig({ ...cfg, organizations: orgs })
}

/**
 * Create a new organization with its own database folder.
 * The folder is created under userData/organizations/<id>/
 */
export function createOrganization(
    name: string,
    profile: OrganizationProfile = 'NONPROFIT'
): { id: string; name: string; dbRoot: string; createdAt: string; profile: OrganizationProfile } {
    assertStorageMoveIdle()
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
        createdAt: new Date().toISOString(),
        profile
    }

    orgs.push(newOrg)
    writeAppConfig({ ...cfg, organizations: orgs })

    return newOrg
}

/**
 * Switch to a different organization.
 * Closes current DB and updates config. Caller should reload the app/window.
 */
export function switchOrganization(orgId: string): { success: boolean; org: { id: string; name: string; dbRoot: string; profile?: OrganizationProfile } } {
    assertStorageMoveIdle()
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
export async function deleteOrganization(orgId: string, deleteData: boolean = false): Promise<{ success: boolean }> {
    assertStorageMoveIdle()
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []

    if (orgs.length <= 1) throw new Error('Die letzte Organisation kann nicht gelöscht werden')
    const activeOrgId = cfg.activeOrgId ?? (orgs[0]?.id || 'default')

    const org = orgs.find(o => o.id === orgId)
    if (!org) throw new Error('Organisation nicht gefunden')

    // Remove from list
    const newOrgs = orgs.filter(o => o.id !== orgId)

    // If deleting the active org, automatically switch to another remaining org.
    if (activeOrgId === orgId) {
        const next = newOrgs[0]
        if (!next) throw new Error('Die letzte Organisation kann nicht gelöscht werden')
        closeDb()
        writeAppConfig({ ...cfg, organizations: newOrgs, activeOrgId: next.id, dbRoot: next.dbRoot })
    } else {
        writeAppConfig({ ...cfg, organizations: newOrgs })
    }

    // Optionally delete data folder
    if (deleteData && org.dbRoot) {
        try {
            await deleteOrganizationStorage(org.dbRoot, path.join(app.getPath('userData'), 'organizations'))
        } catch (e) {
            console.warn('Could not delete org folder:', e)
        }
    }

    return { success: true }
}

/**
 * Get the appearance settings for a specific organization
 */
export function getOrganizationAppearance(orgId: string): { colorTheme: string | null; backgroundImage: string | null; backgroundImageVisibility: number | null; customBackgroundImage: string | null; glassModals: boolean; bookingView: 'classic' | 'plus' | null } {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const org = orgs.find(o => o.id === orgId)
    return {
        colorTheme: org?.colorTheme || null,
        backgroundImage: org?.backgroundImage || null,
        backgroundImageVisibility: org?.backgroundImageVisibility ?? null,
        customBackgroundImage: org?.customBackgroundImage || null,
        glassModals: org?.glassModals ?? false,
        bookingView: org?.bookingView ?? null
    }
}

/**
 * Set the appearance settings for a specific organization
 */
export function setOrganizationAppearance(
    orgId: string,
    appearance: { colorTheme?: string; backgroundImage?: string; backgroundImageVisibility?: number; customBackgroundImage?: string | null; glassModals?: boolean; bookingView?: 'classic' | 'plus' }
): { success: boolean } {
    if (appearance.bookingView !== undefined && appearance.bookingView !== 'classic' && appearance.bookingView !== 'plus') {
        throw new Error('Ungültige Buchungsansicht')
    }
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
            backgroundImageVisibility: undefined,
            customBackgroundImage: undefined,
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
                backgroundImageVisibility: appearance.backgroundImageVisibility,
                customBackgroundImage: appearance.customBackgroundImage === undefined ? undefined : (appearance.customBackgroundImage ?? undefined),
                glassModals: appearance.glassModals,
                bookingView: appearance.bookingView
            })
        } else {
            throw new Error('Organisation nicht gefunden')
        }
    } else {
        const existingOrg = { ...orgs[idx] } as typeof orgs[number] & { backgroundContrast?: boolean }
        delete existingOrg.backgroundContrast
        orgs[idx] = {
            ...existingOrg,
            ...(appearance.colorTheme !== undefined && { colorTheme: appearance.colorTheme }),
            ...(appearance.backgroundImage !== undefined && { backgroundImage: appearance.backgroundImage }),
            ...(appearance.backgroundImageVisibility !== undefined && { backgroundImageVisibility: appearance.backgroundImageVisibility }),
            ...(appearance.customBackgroundImage !== undefined && { customBackgroundImage: appearance.customBackgroundImage ?? undefined }),
            ...(appearance.glassModals !== undefined && { glassModals: appearance.glassModals }),
            ...(appearance.bookingView !== undefined && { bookingView: appearance.bookingView })
        }
    }

    writeAppConfig({ ...cfg, organizations: orgs, activeOrgId: cfg.activeOrgId || 'default' })
    return { success: true }
}

/**
 * Get the appearance settings (theme, background, glass) of the currently active organization
 */
export function getActiveOrganizationAppearance(): { colorTheme: string | null; backgroundImage: string | null; backgroundImageVisibility: number | null; customBackgroundImage: string | null; glassModals: boolean; bookingView: 'classic' | 'plus' | null } {
    const cfg = readAppConfig()
    const orgs = cfg.organizations || []
    const activeId = cfg.activeOrgId

    // If orgs array is empty, return defaults
    if (orgs.length === 0) {
        return { colorTheme: null, backgroundImage: null, backgroundImageVisibility: null, customBackgroundImage: null, glassModals: false, bookingView: null }
    }

    // Find active org
    const activeOrg = orgs.find(o => o.id === activeId) || orgs[0]
    return {
        colorTheme: activeOrg?.colorTheme || null,
        backgroundImage: activeOrg?.backgroundImage || null,
        backgroundImageVisibility: activeOrg?.backgroundImageVisibility ?? null,
        customBackgroundImage: activeOrg?.customBackgroundImage || null,
        glassModals: activeOrg?.glassModals ?? false,
        bookingView: activeOrg?.bookingView ?? null
    }
}
