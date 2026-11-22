import type Database from 'better-sqlite3'
import { safeStorage } from 'electron'
import { AI_PROVIDER_IDS, type AiProviderId } from '../../../shared/aiProviders'

export const legacyAiKey = 'ai.openai.apiKey'
export const migratedPlainKey = 'ai.credentials.rotatedKeyRecommended'
export const aiKeySetting = (provider: AiProviderId) => 'ai.providers.' + provider + '.apiKey'
type StoredSecret = { encrypted: boolean; value: string }
const sessionSecrets = new Map<string, Map<AiProviderId, string>>()

export function assertPublicSetting(key: string) {
  if (key === 'ai.mcp.localhost.token' || key === legacyAiKey || key.startsWith('ai.providers.') || key.startsWith('ai.credentials.') || key === 'ai.openai.provider') {
    throw new Error('Diese KI-Einstellung ist nur über die KI-Verwaltung verfügbar.')
  }
}

function linuxStorageBackend() {
  try { return safeStorage.getSelectedStorageBackend() } catch { return 'unknown' }
}

function canStoreAiKey() {
  try {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || ['kwallet', 'kwallet5', 'kwallet6', 'gnome_libsecret'].includes(linuxStorageBackend()))
  } catch { return false }
}

export function aiKeyStorage(scope: string, provider: AiProviderId): 'secure' | 'session' {
  return sessionSecrets.get(scope)?.has(provider) || !canStoreAiKey() ? 'session' : 'secure'
}

export function storeAiKey(scope: string, provider: AiProviderId, value: string): StoredSecret | null {
  if (canStoreAiKey()) {
    try {
      const encrypted = safeStorage.encryptString(value).toString('base64')
      sessionSecrets.get(scope)?.delete(provider)
      return { encrypted: true, value: encrypted }
    } catch {
      // The OS keychain may lock between the availability check and encryption.
    }
  }
  const secrets = sessionSecrets.get(scope) ?? new Map<AiProviderId, string>()
  secrets.set(provider, value)
  sessionSecrets.set(scope, secrets)
  return null
}

export function readAiKey(scope: string, provider: AiProviderId, stored: StoredSecret | null | undefined) {
  if (stored?.encrypted) {
    try { return safeStorage.decryptString(Buffer.from(stored.value, 'base64')).toString() } catch { return '' }
  }
  return sessionSecrets.get(scope)?.get(provider) ?? ''
}

function isPlainSecret(value: unknown): value is string | { encrypted: false; value: string } {
  return typeof value === 'string' || (!!value && typeof value === 'object' &&
    'encrypted' in value && value.encrypted === false && 'value' in value && typeof value.value === 'string')
}

/** Called on opening each organization, before a backup or renderer can read its settings. */
export function migrateAiCredentials(db: InstanceType<typeof Database>) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'").get()) return
  const read = db.prepare('SELECT value_json FROM settings WHERE key = ?')
  const write = db.prepare('INSERT OR REPLACE INTO settings(key, value_json) VALUES(?, ?)')
  const remove = db.prepare('DELETE FROM settings WHERE key = ?')
  const get = (key: string) => {
    const row = read.get(key) as { value_json: string } | undefined
    if (!row) return undefined
    try { return JSON.parse(row.value_json) } catch { return undefined }
  }
  const legacyValue = get(legacyAiKey)
  const basic = process.platform === 'linux' && linuxStorageBackend() === 'basic_text'
  const providers = AI_PROVIDER_IDS.map(provider => ({ provider, key: aiKeySetting(provider), stored: get(aiKeySetting(provider)) }))
  if (!legacyValue && !providers.some(({ stored }) => isPlainSecret(stored) || (basic && stored?.encrypted))) return
  const selected = get('ai.openai.provider')
  const active = AI_PROVIDER_IDS.find(id => id === selected) ?? 'openai'
  let migratedPlain = false
  db.pragma('secure_delete = ON')
  db.transaction(() => {
    for (const { provider, key, stored: scoped } of providers) {
      const legacy = provider === active ? legacyValue : undefined
      const stored = scoped ?? legacy
      if (isPlainSecret(scoped) || isPlainSecret(legacy)) migratedPlain = true
      if (isPlainSecret(stored)) {
        const encrypted = storeAiKey(db.name, provider, typeof stored === 'string' ? stored : stored.value)
        if (encrypted) write.run(key, JSON.stringify(encrypted))
        else remove.run(key)
      } else if (stored?.encrypted) {
        // Older Linux builds could mark a basic_text value as encrypted. Preserve
        // ciphertext from an unavailable keychain unless the weak backend can read it.
        const oldValue = basic ? readAiKey(db.name, provider, stored) : ''
        if (oldValue) {
          storeAiKey(db.name, provider, oldValue)
          remove.run(key)
          migratedPlain = true
        } else if (!scoped) write.run(key, JSON.stringify(stored))
      }
    }
    remove.run(legacyAiKey)
    if (migratedPlain) write.run(migratedPlainKey, 'true')
  })()
  if (migratedPlain) {
    // Compact old pages before SQLite's online backup copies the database.
    db.exec('VACUUM')
    db.pragma('wal_checkpoint(TRUNCATE)')
  }
}
