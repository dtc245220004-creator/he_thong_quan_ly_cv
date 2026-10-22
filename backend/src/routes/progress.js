import { Router } from 'express'
import { parseDateRange, requestError } from './date-utils.js'

const groupExpressions = {
  day: "DATE_FORMAT(completed_at, '%Y-%m-%d')",
  month: "DATE_FORMAT(completed_at, '%Y-%m')",
  year: "DATE_FORMAT(completed_at, '%Y')",
}
const priorities = ['Low', 'Medium', 'High']
const dateFromSql = 'TIMESTAMP(?)'

function readRange(query) {
  return parseDateRange(query.from, query.to, 1827)
}

function completionFilters(request, from, to) {
  const where = [
    'owner_id = ?',
    "status = 'Done'",
    `completed_at >= ${dateFromSql}`,
    'completed_at < DATE_ADD(TIMESTAMP(?), INTERVAL 1 DAY)',
  ]
  const values = [request.user.id, `${from} 00:00:00`, `${to} 00:00:00`]
  if (request.query.priority) {
    if (!priorities.includes(request.query.priority)) {
      throw requestError(400, 'Bộ lọc ưu tiên không hợp lệ.')
    }
    where.push('priority = ?')
    values.push(request.query.priority)
  }
  return { where, values }
}

export function createProgressRouter(db) {
  const router = Router()

  router.get('/summary', async (request, response) => {
    const { from, to, days } = readRange(request.query)
    const { where, values } = completionFilters(request, from, to)
    const completionWhere = where.join(' AND ')
    const priorityFilter = request.query.priority ? ' AND priority = ?' : ''
    const createdValues = [request.user.id, from, to]
    if (request.query.priority) createdValues.push(request.query.priority)
    const [summary] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND DATE(created_at) BETWEEN ? AND ?${priorityFilter}) AS totalCreated,
         (SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND DATE(created_at) BETWEEN ? AND ?${priorityFilter} AND status = 'Done') AS completedFromCreated,
         (SELECT COUNT(*) FROM tasks WHERE ${completionWhere}) AS completedInRange,
         (SELECT COUNT(*) FROM tasks WHERE ${completionWhere} AND DATE(completed_at) = UTC_DATE()) AS completedToday,
         (SELECT COUNT(*) FROM tasks WHERE ${completionWhere} AND DATE_FORMAT(completed_at, '%Y-%m') = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m')) AS completedThisMonth`,
      [
        ...createdValues,
        ...createdValues,
        ...values,
        ...values,
        ...values,
      ],
    )
    const totalCreated = Number(summary.totalCreated || 0)
    const completedFromCreated = Number(summary.completedFromCreated || 0)
    const previousEnd = new Date(`${from}T00:00:00.000Z`)
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
    const previousStart = new Date(previousEnd)
    previousStart.setUTCDate(previousStart.getUTCDate() - days + 1)
    const previousRangeValues = [
      request.user.id,
      `${previousStart.toISOString().slice(0, 10)} 00:00:00`,
      `${previousEnd.toISOString().slice(0, 10)} 00:00:00`,
    ]
    const previousPrioritySql = request.query.priority ? ' AND priority = ?' : ''
    if (request.query.priority) previousRangeValues.push(request.query.priority)
    const [previous] = await db.query(
      `SELECT COUNT(*) AS completed
       FROM tasks
       WHERE owner_id = ?
         AND completed_at >= TIMESTAMP(?)
         AND completed_at < DATE_ADD(TIMESTAMP(?), INTERVAL 1 DAY)
         AND status = 'Done'${previousPrioritySql}`,
      previousRangeValues,
    )
    const previousPeriodCompleted = Number(previous.completed || 0)
    response.json({
      from,
      to,
      totalCreated,
      completedFromCreated,
      completedInRange: Number(summary.completedInRange || 0),
      completedToday: Number(summary.completedToday || 0),
      completedThisMonth: Number(summary.completedThisMonth || 0),
      completionRate: totalCreated ? Math.round(completedFromCreated * 100 / totalCreated) : 0,
      previousPeriodCompleted,
      completionChangePercent: previousPeriodCompleted
        ? Math.round((Number(summary.completedInRange || 0) - previousPeriodCompleted) * 100 / previousPeriodCompleted)
        : null,
      comparedPeriodDays: days,
    })
  })

  router.get('/completions', async (request, response) => {
    const { from, to } = readRange(request.query)
    const groupBy = request.query.groupBy || 'day'
    if (!Object.hasOwn(groupExpressions, groupBy)) {
      throw requestError(400, 'Kiểu nhóm phải là day, month hoặc year.')
    }
    const { where, values } = completionFilters(request, from, to)
    const expression = groupExpressions[groupBy]
    const items = await db.query(
      `SELECT ${expression} AS period, COUNT(*) AS completed
       FROM tasks WHERE ${where.join(' AND ')}
       GROUP BY period ORDER BY period`,
      values,
    )
    response.json({
      from,
      to,
      groupBy,
      items: items.map((item) => ({ period: item.period, completed: Number(item.completed) })),
    })
  })

  return router
}
