import { Router } from 'express'

export function createDashboardRouter(db) {
  const router = Router()

  router.get('/stats', async (request, response) => {
    const ownerId = request.user.id
    const [counts] = await db.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'To do') AS todo,
         COUNT(*) FILTER (WHERE status = 'In Progress') AS "inProgress",
         COUNT(*) FILTER (WHERE status = 'Done') AS completed,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'Done') AS overdue,
         COUNT(*) FILTER (WHERE priority = 'High') AS "highPriority",
         COUNT(*) FILTER (WHERE priority = 'Medium') AS "mediumPriority",
         COUNT(*) FILTER (WHERE priority = 'Low') AS "lowPriority"
       FROM tasks WHERE owner_id = ?`,
      [ownerId],
    )
    const upcoming = await db.query(
      `SELECT id, title, due_date, status, priority
       FROM tasks
       WHERE owner_id = ? AND due_date >= CURRENT_DATE AND status <> 'Done'
       ORDER BY due_date ASC, id ASC LIMIT 5`,
      [ownerId],
    )
    const recent = await db.query(
      `SELECT id, title, status, priority, updated_at
       FROM tasks WHERE owner_id = ?
       ORDER BY updated_at DESC, id DESC LIMIT 5`,
      [ownerId],
    )

    response.json({
      counts: Object.fromEntries(
        Object.entries(counts).map(([key, value]) => [key, Number(value || 0)]),
      ),
      upcoming,
      recent,
    })
  })

  return router
}
