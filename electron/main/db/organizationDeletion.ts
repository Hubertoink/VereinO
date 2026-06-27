import fs from 'node:fs'
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

export function deleteOrganizationStorage(orgRoot: string, managedOrganizationsRoot: string): void {
    const normalizedOrgRoot = path.resolve(orgRoot)
    const normalizedManagedRoot = path.resolve(managedOrganizationsRoot)

    if (isSubdirectory(normalizedManagedRoot, normalizedOrgRoot)) {
        fs.rmSync(normalizedOrgRoot, { recursive: true, force: true })
        return
    }

    for (const fileName of SQLITE_ARTIFACTS) {
        fs.rmSync(path.join(normalizedOrgRoot, fileName), { force: true })
    }

    fs.rmSync(path.join(normalizedOrgRoot, 'files'), { recursive: true, force: true })
}