import { requireSafetyBackup } from '../../electron/main/services/safetyBackup'

describe('requireSafetyBackup', () => {
    it('returns the successful backup result', async () => {
        const createBackup = jest.fn().mockResolvedValue({ filePath: 'C:\\backups\\database.sqlite' })

        await expect(requireSafetyBackup(createBackup, 'preImport', 'Import')).resolves.toEqual({
            filePath: 'C:\\backups\\database.sqlite'
        })
        expect(createBackup).toHaveBeenCalledWith('preImport')
    })

    it('aborts the protected action when creating the backup fails', async () => {
        const backupError = new Error('Datenträger ist voll')
        const createBackup = jest.fn().mockRejectedValue(backupError)

        await expect(requireSafetyBackup(createBackup, 'preClearAll', 'Alle Buchungen löschen'))
            .rejects.toMatchObject({
                message: 'Das Sicherheitsbackup für „Alle Buchungen löschen“ ist fehlgeschlagen. Die Aktion wurde abgebrochen.',
                cause: backupError
            })
    })

    it('rejects an empty backup path as an invalid backup', async () => {
        const createBackup = jest.fn().mockResolvedValue({ filePath: '   ' })

        await expect(requireSafetyBackup(createBackup, 'preClose', 'Jahresabschluss durchführen'))
            .rejects.toThrow('Die Aktion wurde abgebrochen.')
    })
})
