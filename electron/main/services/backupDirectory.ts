import fs from 'node:fs'

type DirectoryAccess = {
    existsSync: (path: string) => boolean
    mkdirSync: (path: string, options: { recursive: true }) => unknown
    statSync: (path: string) => { isDirectory: () => boolean }
    accessSync: (path: string, mode: number) => void
}

export type BackupDirectoryResolution = {
    dir: string
    usedFallback: boolean
}

export function isUsableBackupDirectory(
    dir: string,
    access: DirectoryAccess = fs
): boolean {
    try {
        if (!access.existsSync(dir)) access.mkdirSync(dir, { recursive: true })
        if (!access.statSync(dir).isDirectory()) return false
        access.accessSync(dir, fs.constants.W_OK)
        return true
    } catch {
        return false
    }
}

export function resolveBackupDirectory(
    configuredDir: string | null | undefined,
    defaultDir: string,
    access: DirectoryAccess = fs
): BackupDirectoryResolution {
    const configured = configuredDir?.trim()
    if (configured && isUsableBackupDirectory(configured, access)) {
        return { dir: configured, usedFallback: false }
    }
    if (isUsableBackupDirectory(defaultDir, access)) {
        return { dir: defaultDir, usedFallback: Boolean(configured) }
    }
    throw new Error(`Der Backup-Ordner ist nicht beschreibbar: ${configured || defaultDir}`)
}
