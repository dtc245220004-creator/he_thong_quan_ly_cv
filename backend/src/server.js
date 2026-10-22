import app from './app.js'
import { pool } from './db.js'

const port = Number(process.env.PORT || 3001)
const server = app.listen(port, () => {
  console.info(`Backend listening at http://localhost:${port}`)
})

async function shutdown(signal) {
  console.info(`Received ${signal}; closing backend connections.`)
  server.close(async (error) => {
    if (error) {
      console.error('Failed to close the HTTP server:', error.message)
      process.exitCode = 1
    }

    try {
      await pool.end()
    } catch (poolError) {
      console.error('Failed to close the MySQL pool:', poolError.message)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
