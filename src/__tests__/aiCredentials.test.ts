import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const { backup, DatabaseSync } = require('node:sqlite')
import { safeStorage } from 'electron'
import { aiKeySetting, aiKeyStorage, assertPublicSetting, legacyAiKey, migrateAiCredentials, migratedPlainKey, readAiKey, storeAiKey } from '../../electron/main/services/aiCredentials'

jest.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: jest.fn(), getSelectedStorageBackend: jest.fn(() => 'gnome_libsecret'),
  encryptString: jest.fn((value: string) => Buffer.from('fixture:' + value)),
  decryptString: (value: Buffer) => value.toString().slice(8)
} }))

it.each(['secure', 'unavailable', 'locked', 'linux-backend-error'] as const)('migrates legacy and scoped plaintext before backup (%s)', async mode => {
  const secure = mode === 'secure'
  jest.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(mode !== 'unavailable')
  const encrypt = jest.mocked(safeStorage.encryptString)
  if (mode === 'locked') {
    const locked = () => { throw new Error('Keychain locked') }
    encrypt.mockImplementationOnce(locked).mockImplementationOnce(locked)
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'vereino-credential-test-'))
  const name = path.join(dir, 'club.sqlite')
  const db = new DatabaseSync(name)
  const settings = {
    name, prepare: db.prepare.bind(db), exec: db.exec.bind(db),
    pragma: (statement: string) => db.exec('PRAGMA ' + statement),
    transaction: (work: () => void) => () => {
      db.exec('BEGIN')
      try { work(); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
    }
  }
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  try {
    if (mode === 'linux-backend-error') {
      Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
      jest.mocked(safeStorage.getSelectedStorageBackend).mockImplementation(() => { throw new Error('Keyring offline') })
    }
    db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL)')
    const insert = db.prepare('INSERT INTO settings VALUES (?, ?)')
    const get = (key: string) => JSON.parse(String(db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key)?.value_json ?? 'null'))
    insert.run(legacyAiKey, JSON.stringify('old-openai-token-fixture'))
    insert.run(aiKeySetting('anthropic'), JSON.stringify({ encrypted: false, value: 'old-claude-token-fixture' }))
    migrateAiCredentials(settings as Parameters<typeof migrateAiCredentials>[0])
    migrateAiCredentials(settings as Parameters<typeof migrateAiCredentials>[0])
    expect(get(legacyAiKey)).toBeNull()
    expect(get(migratedPlainKey)).toBe(true)
    expect(readAiKey(name, 'openai', get(aiKeySetting('openai')))).toBe('old-openai-token-fixture')
    expect(readAiKey(name, 'anthropic', get(aiKeySetting('anthropic')))).toBe('old-claude-token-fixture')
    expect(aiKeyStorage(name, 'anthropic')).toBe(secure ? 'secure' : 'session')
    expect(readAiKey('another-organization', 'openai', null)).toBe('')
    if (secure) expect(get(aiKeySetting('anthropic'))).toMatchObject({ encrypted: true })
    else expect(get(aiKeySetting('anthropic'))).toBeNull()
    const target = path.join(dir, 'backup.sqlite')
    await backup(db, target)
    const bytes = await readFile(target)
    expect(bytes.includes('old-openai-token-fixture')).toBe(false)
    expect(bytes.includes('old-claude-token-fixture')).toBe(false)
  } finally {
    if (mode === 'linux-backend-error') Object.defineProperty(process, 'platform', platform)
    jest.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('gnome_libsecret')
    db.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('returns only session storage without OS encryption and blocks generic IPC reads and writes to credentials', () => {
  jest.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
  expect(storeAiKey('club', 'anthropic', 'session-token')).toBeNull()
  expect(readAiKey('club', 'anthropic', null)).toBe('session-token')
  expect(readAiKey('club', 'openai', null)).toBe('')
  for (const key of [legacyAiKey, aiKeySetting('anthropic'), 'ai.mcp.localhost.token']) {
    expect(() => assertPublicSetting(key)).toThrow('KI-Verwaltung')
  }
  expect(() => assertPublicSetting('backup.dir')).not.toThrow()
})
