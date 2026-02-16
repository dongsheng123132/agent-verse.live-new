#!/usr/bin/env node
/**
 * Initialize database tables & seed data.
 * Usage: node scripts/init-db.js
 * Requires DATABASE_URL in .env
 */
import 'dotenv/config'
import fs from 'fs'
import pg from 'pg'

const { Pool } = pg

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set in .env')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const sqlPath = new URL('./init-db.sql', import.meta.url)
  const sql = fs.readFileSync(sqlPath, 'utf-8')

  console.log('Connecting to database...')
  const client = await pool.connect()
  try {
    await client.query(sql)
    console.log('Database initialized successfully!')

    // Show table stats
    const cells = await client.query('SELECT count(*) FROM grid_cells')
    const orders = await client.query('SELECT count(*) FROM grid_orders')
    console.log(`  grid_cells: ${cells.rows[0].count} rows`)
    console.log(`  grid_orders: ${orders.rows[0].count} rows`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('DB init failed:', err.message)
  process.exit(1)
})
