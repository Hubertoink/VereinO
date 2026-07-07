import { Pool } from 'pg'

let pool: Pool

export async function initializeDatabase(): Promise<Pool> {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  })

  // Test connection
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT NOW()')
    console.log('Database connected at:', result.rows[0].now)
    client.release()
  } catch (err) {
    console.error('Database connection failed:', err)
    throw err
  }

  return pool
}

export function getDatabase(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return pool
}

