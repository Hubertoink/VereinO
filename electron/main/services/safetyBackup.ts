type BackupResult = {
    filePath: string
}

type BackupCreator = (reason: string) => Promise<BackupResult>

export async function requireSafetyBackup(
    createBackup: BackupCreator,
    reason: string,
    action: string
): Promise<BackupResult> {
    try {
        const result = await createBackup(reason)
        if (!result.filePath.trim()) {
            throw new Error('Es wurde kein Sicherungspfad zurückgegeben.')
        }
        return result
    } catch (error) {
        const wrappedError = new Error(
            `Das Sicherheitsbackup für „${action}“ ist fehlgeschlagen. Die Aktion wurde abgebrochen.`
        ) as Error & { cause?: unknown }
        wrappedError.cause = error
        throw wrappedError
    }
}
