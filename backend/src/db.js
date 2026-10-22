import mysql from 'mysql2/promise'

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER,
  DB_PASSWORD,
  DB_NAME = 'task_tracker',
} = process.env

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT || 3306),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 5000,
  enableKeepAlive: true,
  timezone: 'Z',
  dateStrings: ['DATE'],
})

pool.on('error', (error) => {
  console.error('Unexpected MySQL pool error:', error.code || 'UNKNOWN')
})

function hasDatabaseConfiguration() {
  return Boolean(
    DB_USER &&
      DB_PASSWORD !== undefined &&
      Number.isInteger(Number(DB_PORT || 3306)),
  )
}

export async function queryDatabase(sql, values = []) {
  if (!hasDatabaseConfiguration()) {
    const error = new Error(
      'DB_USER and DB_PASSWORD must be configured',
    )
    error.code = 'DB_CONFIG_MISSING'
    throw error
  }

  const [rows] = await pool.execute(sql, values)
  return rows
}

export async function withTransaction(callback) {
  if (!hasDatabaseConfiguration()) {
    const error = new Error('DB_USER and DB_PASSWORD must be configured')
    error.code = 'DB_CONFIG_MISSING'
    throw error
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const transaction = {
      query: async (sql, values = []) => {
        const [rows] = await connection.execute(sql, values)
        return rows
      },
    }
    const result = await callback(transaction)
    await connection.commit()
    return result
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('MySQL transaction rollback failed:', rollbackError.code || 'UNKNOWN')
    }
    throw error
  } finally {
    connection.release()
  }
}

export async function checkDatabaseConnection() {
  const rows = await queryDatabase('SELECT 1 AS connected, DATABASE() AS databaseName')
  return rows[0]
}
