import { checkDatabaseConnection, pool } from './db.js'

function connectionFailureMessage(error) {
  if (error.code === 'DB_CONFIG_MISSING') {
    return 'Cấu hình DB_USER hoặc DB_PASSWORD còn thiếu. Kiểm tra file .env.'
  }
  if (error.code === 'ECONNREFUSED') {
    return 'Không kết nối được PostgreSQL. Kiểm tra dịch vụ, DB_HOST và DB_PORT.'
  }
  if (error.code === '28P01') {
    return 'PostgreSQL từ chối đăng nhập. Kiểm tra DB_USER và DB_PASSWORD.'
  }
  if (error.code === '3D000') {
    return 'Database trong DB_NAME chưa tồn tại. Kiểm tra cấu hình PostgreSQL.'
  }
  return `Lỗi kết nối PostgreSQL (${error.code || 'UNKNOWN'}). Kiểm tra cấu hình và server.`
}

try {
  const connection = await checkDatabaseConnection()
  console.info(`PostgreSQL connection successful (database: ${connection.databaseName}).`)
} catch (error) {
  console.error('PostgreSQL connection failed:', connectionFailureMessage(error))
  process.exitCode = 1
} finally {
  await pool.end()
}
