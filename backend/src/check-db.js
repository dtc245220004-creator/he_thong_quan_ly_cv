import { checkDatabaseConnection, pool } from './db.js'

function connectionFailureMessage(error) {
  if (error.code === 'DB_CONFIG_MISSING') {
    return 'Cấu hình DB_USER hoặc DB_PASSWORD còn thiếu. Kiểm tra file .env.'
  }
  if (error.code === 'ECONNREFUSED') {
    return 'Không kết nối được MySQL Server. Kiểm tra dịch vụ, DB_HOST và DB_PORT.'
  }
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'MySQL từ chối đăng nhập. Kiểm tra DB_USER và DB_PASSWORD.'
  }
  if (error.code === 'ER_BAD_DB_ERROR') {
    return 'Database trong DB_NAME chưa tồn tại. Tạo database trong MySQL Workbench.'
  }
  return `Lỗi kết nối MySQL (${error.code || 'UNKNOWN'}). Kiểm tra cấu hình và server.`
}

try {
  const connection = await checkDatabaseConnection()
  console.info(`MySQL connection successful (database: ${connection.databaseName}).`)
} catch (error) {
  console.error('MySQL connection failed:', connectionFailureMessage(error))
  process.exitCode = 1
} finally {
  await pool.end()
}
