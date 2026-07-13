import fs from 'node:fs/promises'
import path from 'node:path'

const SQLITE_ARTIFACTS = [
    'database.sqlite',
    'database.sqlite-shm',
    'database.sqlite-wal',
    'database.sqlite-journal'
]

function isSubdirectory(parentDir: string, candidateDir: string): boolean {
    const relative = path.relative(parentDir, candidateDir)
    return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export async function deleteOrganizationStorage(orgRoot: string, managedOrganizationsRoot: string): Promise<void> {
    const normalizedOrgRoot = path.resolve(orgRoot)
    const normalizedManagedRoot = path.resolve(managedOrganizationsRoot)

    if (isSubdirectory(normalizedManagedRoot, normalizedOrgRoot)) {
        await fs.rm(normalizedOrgRoot, { recursive: true, force: true })
        return
    }

    for (const fileName of SQLITE_ARTIFACTS) {
        await fs.rm(path.join(normalizedOrgRoot, fileName), { force: true })
    }

    await fs.rm(path.join(normalizedOrgRoot, 'files'), { recursive: true, force: true })
}
