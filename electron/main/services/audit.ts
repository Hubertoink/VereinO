import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
type DB = InstanceType<typeof Database>

function stableJson(obj: unknown) {
    return JSON.stringify(obj, Object.keys(obj as any).sort())
}

function hashAudit(payload: unknown, timestamp: string, user: number | null) {
    const h = crypto.createHash('sha256')
    h.update(stableJson(payload))
    h.update(timestamp)
    h.update(String(user ?? ''))
    return h.digest('hex')
}

export function writeAudit(
    db: DB,
    userId: number | null,
    entity: string,
    entityId: number,
    action: string,
    diff: unknown
) {
    const ts = new Date().toISOString()
    const hash = hashAudit(diff, ts, userId)
    db
        .prepare(
            'INSERT INTO audit_log(user_id, entity, entity_id, action, diff_json, hash, created_at) VALUES (?,?,?,?,?,?,?)'
        )
        .run(userId, entity, entityId, action, JSON.stringify(diff), hash, ts)
}
