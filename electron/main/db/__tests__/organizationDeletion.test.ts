import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { deleteOrganizationStorage } from '../organizationDeletion'

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-org-delete-'))
}

describe('deleteOrganizationStorage', () => {
    it('removes an organization folder completely when it lives under the managed organizations root', () => {
        const tempRoot = makeTempDir()
        const managedRoot = path.join(tempRoot, 'organizations')
        const orgRoot = path.join(managedRoot, 'org_1')

        fs.mkdirSync(path.join(orgRoot, 'files'), { recursive: true })
        fs.writeFileSync(path.join(orgRoot, 'database.sqlite'), 'db')
        fs.writeFileSync(path.join(orgRoot, 'files', 'receipt.pdf'), 'file')

        deleteOrganizationStorage(orgRoot, managedRoot)

        expect(fs.existsSync(orgRoot)).toBe(false)
    })

    it('only removes database artifacts for shared roots and keeps unrelated app data intact', () => {
        const tempRoot = makeTempDir()
        const managedRoot = path.join(tempRoot, 'organizations')
        const sharedRoot = path.join(tempRoot, 'shared-root')
        const siblingOrgRoot = path.join(managedRoot, 'org_2')

        fs.mkdirSync(path.join(sharedRoot, 'files'), { recursive: true })
        fs.mkdirSync(siblingOrgRoot, { recursive: true })
        fs.writeFileSync(path.join(sharedRoot, 'database.sqlite'), 'db')
        fs.writeFileSync(path.join(sharedRoot, 'database.sqlite-wal'), 'wal')
        fs.writeFileSync(path.join(sharedRoot, 'config.json'), 'cfg')
        fs.writeFileSync(path.join(sharedRoot, 'files', 'member.csv'), 'member-data')
        fs.writeFileSync(path.join(siblingOrgRoot, 'database.sqlite'), 'other-db')

        deleteOrganizationStorage(sharedRoot, managedRoot)

        expect(fs.existsSync(path.join(sharedRoot, 'database.sqlite'))).toBe(false)
        expect(fs.existsSync(path.join(sharedRoot, 'database.sqlite-wal'))).toBe(false)
        expect(fs.existsSync(path.join(sharedRoot, 'files'))).toBe(false)
        expect(fs.existsSync(path.join(sharedRoot, 'config.json'))).toBe(true)
        expect(fs.existsSync(path.join(siblingOrgRoot, 'database.sqlite'))).toBe(true)
    })
})