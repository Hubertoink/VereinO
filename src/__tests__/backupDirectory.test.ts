import {
    isUsableBackupDirectory,
    resolveBackupDirectory
} from '../../electron/main/services/backupDirectory'

function fakeAccess(options: { unusable?: string[] } = {}) {
    const unusable = new Set(options.unusable ?? [])
    return {
        existsSync: (path: string) => !unusable.has(path),
        mkdirSync: (path: string) => {
            if (unusable.has(path)) throw new Error('Zugriff verweigert')
        },
        statSync: (path: string) => ({
            isDirectory: () => !unusable.has(path)
        }),
        accessSync: (path: string) => {
            if (unusable.has(path)) throw new Error('Nicht beschreibbar')
        }
    }
}

describe('backup directory resolution', () => {
    it('keeps a usable configured directory', () => {
        expect(resolveBackupDirectory(' C:\\Backups ', 'C:\\Default', fakeAccess()))
            .toEqual({ dir: 'C:\\Backups', usedFallback: false })
    })

    it('falls back when a configured directory belongs to an unavailable profile', () => {
        const configured = 'C:\\Users\\OTHER\\Documents\\Backups'
        expect(resolveBackupDirectory(
            configured,
            'C:\\Users\\current\\AppData\\Backups',
            fakeAccess({ unusable: [configured] })
        )).toEqual({
            dir: 'C:\\Users\\current\\AppData\\Backups',
            usedFallback: true
        })
    })

    it('throws when neither directory is writable', () => {
        const configured = 'C:\\Configured'
        const fallback = 'C:\\Default'
        expect(() => resolveBackupDirectory(
            configured,
            fallback,
            fakeAccess({ unusable: [configured, fallback] })
        )).toThrow('nicht beschreibbar')
    })

    it('recognizes non-directory paths as unusable', () => {
        expect(isUsableBackupDirectory('C:\\file.sqlite', {
            ...fakeAccess(),
            statSync: () => ({ isDirectory: () => false })
        })).toBe(false)
    })
})
