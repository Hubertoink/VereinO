import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'

// Run from backend/ in development and /app in the container.
const migrationsDirectory = resolve(process.env.MIGRATIONS_DIR || 'migrations')
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL environment variable is required')
const pool = new Pool({ connectionString })
const client = await pool.connect()
try {
  // Serialize startup across replicas, including creating the migration ledger.
  await client.query('SELECT pg_advisory_lock(739701)')
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  for (const name of readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
    if (applied.rowCount) continue
    await client.query('BEGIN')
    try {
      // Earlier prototypes ran 001 without a ledger. Adopt that schema once;
      // subsequent additive migrations still run normally.
      const legacy =
        name === '001_initial_schema.sql'
          ? await client.query("SELECT to_regclass('public.organizations') AS existing")
          : null
      if (legacy?.rows[0]?.existing) {
        const required = [
          'organizations',
          'users',
          'accounts',
          'vouchers',
          'bookings',
          'members',
          'attachments',
          'tags',
          'member_payments',
          'settings',
          'audit_log'
        ]
        const tables = await client.query(
          'SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NULL',
          [required]
        )
        if (tables.rowCount)
          throw new Error(
            `Incomplete legacy schema: missing ${tables.rows.map((row) => row.name).join(', ')}`
          )
      } else {
        await client.query(readFileSync(resolve(migrationsDirectory, name), 'utf8'))
      }
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
      console.log(`Migration applied: ${name}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(739701)').catch(() => undefined)
  client.release()
  await pool.end()
}
