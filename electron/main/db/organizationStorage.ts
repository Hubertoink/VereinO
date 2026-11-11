import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type SQLite from 'better-sqlite3'

type Organization = { id: string; name: string; dbRoot: string }

// Resolve junctions/symlinks, including when the final directory does not exist.
async function canonicalPath(value: string): Promise<string> {
  const resolved = path.resolve(value)
  try { return await fs.realpath(resolved) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(resolved) === resolved) throw error
    return path.join(await canonicalPath(path.dirname(resolved)), path.basename(resolved))
  }
}

function contains(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

export async function validateOrganizationStorageTarget(root: string, organization: Organization, organizations: Organization[]) {
  if (!root?.trim() || !path.isAbsolute(root)) throw new Error('Bitte einen vollständigen Zielordner auswählen.')
  const target = await canonicalPath(root)
  const source = await canonicalPath(organization.dbRoot)
  if (contains(source, target) || contains(target, source)) {
    throw new Error('Bitte einen anderen Ordner außerhalb des bisherigen Speicherorts auswählen.')
  }
  for (const other of organizations) {
    if (other.id === organization.id) continue
    const otherRoot = await canonicalPath(other.dbRoot)
    if (contains(target, otherRoot) || contains(otherRoot, target)) {
      throw new Error(`Dieser Ordner gehört zur Organisation „${other.name}“ oder überschneidet sich mit ihrem Speicherort.`)
    }
  }
  try {
    if ((await fs.readdir(target)).length) throw new Error('Bitte einen leeren Zielordner wählen. Vorhandene Daten werden nicht überschrieben.')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return target
}

/** Prepare a complete copy; the caller commits the organization config last. */
export async function copyOrganizationStorage(input: {
  sourceRoot: string
  targetRoot: string
  database: InstanceType<typeof SQLite>
  openDatabase: (filename: string) => InstanceType<typeof SQLite>
}) {
  const { sourceRoot, targetRoot, database, openDatabase } = input
  await fs.mkdir(targetRoot, { recursive: true })
  if ((await fs.readdir(targetRoot)).length) throw new Error('Der Zielordner ist nicht mehr leer. Bitte einen anderen Ordner wählen.')
  const staging = path.join(targetRoot, `.vereino-move-${randomUUID()}`)
  await fs.mkdir(staging)
  try {
    const snapshot = path.join(staging, 'database.sqlite')
    await database.backup(snapshot)
    // Copy all attachments, including invoice files and nested directories.
    // A failed copy must never be treated as a successful relocation.
    for (const directory of ['files', 'backups']) {
      const source = path.join(sourceRoot, directory)
      try { await fs.stat(source) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      await fs.cp(source, path.join(staging, directory), {
        recursive: true, force: false, errorOnExist: true,
        filter: async entry => {
          if ((await fs.lstat(entry)).isSymbolicLink()) throw new Error('Verknüpfungen im Datenordner können nicht übernommen werden.')
          return true
        },
      })
    }
    await fs.mkdir(path.join(staging, 'files'), { recursive: true })
    const copied = openDatabase(snapshot)
    try {
      for (const table of ['voucher_files', 'invoice_files']) {
        if (!copied.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) continue
        const rows = copied.prepare(`SELECT id, file_path FROM ${table}`).all() as Array<{ id: number; file_path: string }>
        for (const row of rows) {
          const relative = path.relative(path.join(sourceRoot, 'files'), row.file_path)
          // Older databases can still contain paths from a previous location.
          const name = contains(path.join(sourceRoot, 'files'), row.file_path) ? relative : path.basename(row.file_path)
          try { await fs.access(path.join(staging, 'files', name)) } catch {
            throw new Error(`Die Belegdatei „${name}“ konnte nicht übernommen werden. Der bisherige Speicherort bleibt aktiv.`)
          }
          copied.prepare(`UPDATE ${table} SET file_path = ? WHERE id = ?`).run(path.join(targetRoot, 'files', name), row.id)
        }
      }
      if (copied.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Die kopierte Datenbank konnte nicht verifiziert werden.')
      copied.pragma('wal_checkpoint(TRUNCATE)')
      copied.pragma('journal_mode = DELETE')
    } finally { copied.close() }
    const entries = await fs.readdir(targetRoot)
    if (entries.length !== 1 || entries[0] !== path.basename(staging)) throw new Error('Der Zielordner wurde während des Kopierens verändert.')
    await fs.rename(path.join(staging, 'files'), path.join(targetRoot, 'files'))
    try { await fs.rename(path.join(staging, 'backups'), path.join(targetRoot, 'backups')) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await fs.copyFile(snapshot, path.join(targetRoot, 'database.sqlite'), constants.COPYFILE_EXCL)
  } finally {
    // This is only our generated staging directory, never source or targetRoot.
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
  return { root: targetRoot, dbPath: path.join(targetRoot, 'database.sqlite'), filesDir: path.join(targetRoot, 'files') }
}
