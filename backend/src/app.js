import express from 'express'
import { queryDatabase, withTransaction } from './db.js'
import { createAuthRouter, requireAuth, requireRole } from './auth.js'
import { createDashboardRouter } from './routes/dashboard.js'
import { createTasksRouter } from './routes/tasks.js'
import { createCalendarRouter } from './routes/calendar.js'
import { createProgressRouter } from './routes/progress.js'
import { createProfileRouter } from './routes/profile.js'
import { createAdminRouter } from './routes/admin.js'
import { metricsRegistry, recordHttpMetrics } from './metrics.js'

function isDatabaseUnavailable(error) {
  const code = error.code

  return (
    code === 'DB_CONFIG_MISSING' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === '28P01' ||
    code === '3D000' ||
    code === '53300' ||
    code === '42P01' ||
    code === '42703' ||
    code === '08000' ||
    code === '08003' ||
    code === '08006'
  )
}

export function createApp({ db, transaction } = {}) {
  const database = db || { query: queryDatabase }
  const runTransaction = transaction || (db ? (callback) => callback(database) : withTransaction)
  const app = express()

  app.use(recordHttpMetrics)
  app.get('/metrics', async (_request, response, next) => {
    try {
      response.set('Content-Type', metricsRegistry.contentType)
      response.end(await metricsRegistry.metrics())
    } catch (error) {
      next(error)
    }
  })

  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.use((request, response, next) => {
    const origin = request.get('origin')
    if (origin && allowedOrigins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Credentials', 'true')
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    }
    if (request.method === 'OPTIONS') {
      response.status(origin && !allowedOrigins.includes(origin) ? 403 : 204).end()
      return
    }
    if (
      origin &&
      request.path.startsWith('/api/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !allowedOrigins.includes(origin)
    ) {
      response.status(403).json({ error: 'Forbidden', message: 'Nguồn gửi yêu cầu không được phép.' })
      return
    }
    next()
  })
  app.use(express.json({ limit: '32kb' }))

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' })
  })

  app.use('/api/auth', createAuthRouter(database, runTransaction))
  app.use('/api', requireAuth.bind(null, database))
  app.use('/api/admin', requireRole('admin'), createAdminRouter(database, runTransaction))
  app.use('/api/tasks', createTasksRouter(database))
  app.use('/api/dashboard', createDashboardRouter(database))
  app.use('/api/calendar', createCalendarRouter(database))
  app.use('/api/progress', createProgressRouter(database))
  app.use('/api/profile', createProfileRouter(database))

  app.use((error, _request, response, _next) => {
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status)
      ? error.status
      : undefined
    console.error('API request failed:', error.code || status || 'UNEXPECTED')

    if (isDatabaseUnavailable(error)) {
      response.status(503).json({
        error: 'Database unavailable',
        message: 'Không thể kết nối PostgreSQL. Kiểm tra cấu hình DB_* và trạng thái database.',
      })
      return
    }

    if (error.type === 'entity.parse.failed' || error.status === 413) {
      response.status(error.status).json({
        error: 'Invalid request',
        message:
          error.status === 413
            ? 'Request body is too large.'
            : 'Request body must contain valid JSON.',
      })
      return
    }

    if (status) {
      response.status(status).json({
        error:
          status === 404
            ? 'Task not found'
            : status === 401
              ? 'Unauthorized'
              : status === 403
                ? 'Forbidden'
                : status === 409
                  ? 'Conflict'
                  : status === 429
                    ? 'Rate limit exceeded'
                    : status === 503
                      ? 'Service unavailable'
                  : 'Invalid request',
        message: error.message,
      })
      return
    }

    response.status(500).json({
      error: 'Internal server error',
      message: 'Không thể xử lý yêu cầu công việc.',
    })
  })

  return app
}

const app = createApp()

export default app
