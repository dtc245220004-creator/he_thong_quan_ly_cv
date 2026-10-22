import pg from 'pg'

const { Pool } = pg
const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '5432',
  DB_USER,
  DB_PASSWORD,
  DB_NAME = 'task_tracker',
} = process.env

export const pool = new Pool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
})

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.code || 'UNKNOWN')
})

function hasDatabaseConfiguration() {
  return Boolean(
    DB_USER &&
      DB_PASSWORD !== undefined &&
      Number.isInteger(Number(DB_PORT)) &&
      Number(DB_PORT) > 0,
  )
}

function toPostgresParameters(sql) {
  let result = ''
  let parameter = 0
  let quote = null

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    if (quote) {
      result += character
      if (character === quote) {
        if (sql[index + 1] === quote) {
          result += sql[index + 1]
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      result += character
    } else if (character === '?') {
      parameter += 1
      result += `$${parameter}`
    } else {
      result += character
    }
  }
  return result
}

export async function queryDatabase(sql, values = []) {
  if (!hasDatabaseConfiguration()) {
    const error = new Error('DB_USER and DB_PASSWORD must be configured')
    error.code = 'DB_CONFIG_MISSING'
    throw error
  }

  const result = await pool.query(toPostgresParameters(sql), values)
  return result.rows
}

export async function withTransaction(callback) {
  if (!hasDatabaseConfiguration()) {
    const error = new Error('DB_USER and DB_PASSWORD must be configured')
    error.code = 'DB_CONFIG_MISSING'
    throw error
  }

  const connection = await pool.connect()
  try {
    await connection.query('BEGIN')
    const transaction = {
      query: async (sql, values = []) => {
        const result = await connection.query(toPostgresParameters(sql), values)
        return result.rows
      },
    }
    const result = await callback(transaction)
    await connection.query('COMMIT')
    return result
  } catch (error) {
    try {
      await connection.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('PostgreSQL transaction rollback failed:', rollbackError.code || 'UNKNOWN')
    }
    throw error
  } finally {
    connection.release()
  }
}

export async function checkDatabaseConnection() {
  const rows = await queryDatabase('SELECT 1 AS connected, current_database() AS "databaseName"')
  return rows[0]
}

export { toPostgresParameters }
