import type Database from 'better-sqlite3'
import { getDb } from '../db/database'

type DB = InstanceType<typeof Database>

export function settingsScope(): string { return getDb().name }

export function getSetting<T = unknown>(key: string, db?: DB): T | undefined {
    const d = db ?? getDb()
    const row = d.prepare('SELECT value_json FROM settings WHERE key=?').get(key) as
        | { value_json: string }
        | undefined
    if (!row) return undefined
    try {
        return JSON.parse(row.value_json) as T
    } catch {
        return undefined
    }
}

export function setSetting(key: string, value: unknown, db?: DB) {
    const d = db ?? getDb()
    d.prepare('INSERT INTO settings(key, value_json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(
        key,
        JSON.stringify(value)
    )
}

export function ensurePeriodOpen(dateISO: string, db?: DB) {
    const lock = getSetting<{ closedUntil?: string | null; years?: number[] }>('period_lock', db)
    if (!lock) return
    const y = Number(dateISO.slice(0, 4))
    // Prefer cumulative barrier date when present
    if (lock.closedUntil && typeof lock.closedUntil === 'string') {
        if (dateISO <= lock.closedUntil) {
            throw new Error(`Periode bis ${lock.closedUntil} ist abgeschlossen (Jahresabschluss)`)
        }
        return
    }
    // Migrate legacy single-year array to barrier model on first check
    if (Array.isArray(lock.years) && lock.years.length > 0) {
        const maxYear = Math.max(...lock.years)
        // Persist new barrier representation
        try { setSetting('period_lock', { closedUntil: `${maxYear}-12-31` }, db) } catch {}
        if (y <= maxYear) {
            throw new Error(`Periode bis ${maxYear}-12-31 ist abgeschlossen (Jahresabschluss)`)
        }
        return
    }
    // No lock info
}
