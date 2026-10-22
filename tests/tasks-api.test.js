import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { after, test } from 'node:test'
import bcrypt from 'bcryptjs'
import { createApp } from '../backend/src/app.js'

const token = 'unit-test-session-token'
const tokenHash = createHash('sha256').update(token).digest('hex')
const user = { id: 42, name: 'Test User', email: 'test@example.com', role: 'user' }
const cookie = `task_tracker_session=${token}`
const sampleTask = {
  id: 7,
  title: 'Prepare project plan',
  description: 'A private task',
  start_date: null,
  due_date: null,
  status: 'In Progress',
  priority: 'High',
  assignee: null,
  created_at: '2026-10-21T00:00:00.000Z',
  updated_at: '2026-10-21T00:00:00.000Z',
}
const servers = []

async function startServer(query) {
  const server = createApp({ db: { query } }).listen(0)
  servers.push(server)
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

function authenticatedQuery(onQuery = async () => []) {
  return async (sql, values = []) => {
    if (sql.includes('FROM auth_sessions s')) {
      assert.deepEqual(values, [tokenHash])
      return [user]
    }
    return onQuery(sql, values)
  }
}

after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })))
})

test('GET /health reports that the backend is running', async () => {
  const baseUrl = await startServer(async () => [])
  const response = await fetch(`${baseUrl}/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('private task routes require a valid session', async () => {
  let queryCount = 0
  const baseUrl = await startServer(async () => { queryCount += 1; return [] })
  const response = await fetch(`${baseUrl}/api/tasks`)
  assert.equal(response.status, 401)
  assert.equal(queryCount, 0)
})

test('GET /api/tasks applies owner scope, filters, sorting, and pagination in MySQL', async () => {
  let listQuery
  const baseUrl = await startServer(authenticatedQuery(async (sql, values) => {
    if (sql.includes('COUNT(*) AS total')) return [{ total: 1 }]
    listQuery = { sql, values }
    return [sampleTask]
  }))
  const response = await fetch(`${baseUrl}/api/tasks?page=2&pageSize=5&status=In%20Progress&search=plan&sort=due&order=asc`, {
    headers: { Cookie: cookie },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    items: [sampleTask],
    page: 2,
    pageSize: 5,
    total: 1,
    totalPages: 1,
  })
  assert.match(listQuery.sql, /owner_id = \?/)
  assert.match(listQuery.sql, /status = \?/)
  assert.match(listQuery.sql, /title LIKE \? OR description LIKE \?/)
  assert.match(listQuery.sql, /ORDER BY due_date ASC/)
  assert.deepEqual(listQuery.values, [42, 'In Progress', '%plan%', '%plan%', 5, 5])
})

test('GET /api/dashboard/stats aggregates only the authenticated owner data', async () => {
  const baseUrl = await startServer(authenticatedQuery(async (sql, values) => {
    assert.deepEqual(values, [42])
    assert.match(sql, /owner_id = \?/)
    if (sql.includes('SUM(status =')) {
      return [{
        total: 3,
        todo: 1,
        inProgress: 1,
        completed: 1,
        overdue: 0,
        highPriority: 1,
        mediumPriority: 1,
        lowPriority: 1,
      }]
    }
    return [sampleTask]
  }))
  const response = await fetch(`${baseUrl}/api/dashboard/stats`, { headers: { Cookie: cookie } })
  assert.equal(response.status, 200)
  const stats = await response.json()
  assert.deepEqual(stats.counts, {
    total: 3,
    todo: 1,
    inProgress: 1,
    completed: 1,
    overdue: 0,
    highPriority: 1,
    mediumPriority: 1,
    lowPriority: 1,
  })
  assert.deepEqual(stats.upcoming, [sampleTask])
  assert.deepEqual(stats.recent, [sampleTask])
})

test('POST /api/tasks validates input and saves a task for the session owner', async () => {
  let insertValues
  const created = { ...sampleTask, id: 8, title: 'New task' }
  const baseUrl = await startServer(authenticatedQuery(async (sql, values) => {
    if (sql.startsWith('INSERT INTO tasks')) {
      insertValues = values
      return { insertId: 8 }
    }
    assert.match(sql, /WHERE id = \? AND owner_id = \?/)
    assert.deepEqual(values, [8, 42])
    return [created]
  }))
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: ' New task ', priority: 'High' }),
  })
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), created)
  assert.deepEqual(insertValues, ['New task', null, null, null, 'To do', 'High', null, 42, 'To do'])
})

test('calendar filters are owner-scoped and reject invalid date windows', async () => {
  let calendarQuery
  const baseUrl = await startServer(authenticatedQuery(async (sql, values) => {
    calendarQuery = { sql, values }
    return [sampleTask]
  }))
  const response = await fetch(`${baseUrl}/api/calendar?startDate=2026-10-01&endDate=2026-10-31&status=In%20Progress&priority=High&userId=99`, {
    headers: { Cookie: cookie },
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.items, [sampleTask])
  assert.match(calendarQuery.sql, /owner_id = \?/)
  assert.deepEqual(calendarQuery.values, [42, '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-31', '2026-10-31', '2026-10-01', 'In Progress', 'High'])

  const invalid = await fetch(`${baseUrl}/api/calendar?startDate=2026-02-30&endDate=2026-03-02`, {
    headers: { Cookie: cookie },
  })
  assert.equal(invalid.status, 400)
})

test('progress completions and summary use authenticated owner and validated grouping', async () => {
  const baseUrl = await startServer(authenticatedQuery(async (sql, values) => {
    assert.match(sql, /owner_id = \?/)
    assert.ok(values.includes(42))
    if (sql.includes('completedThisMonth')) {
      return [{ totalCreated: 4, completedFromCreated: 2, completedInRange: 3, completedToday: 1, completedThisMonth: 2 }]
    }
    return [{ period: '2026-10-20', completed: 3 }]
  }))
  const summaryResponse = await fetch(`${baseUrl}/api/progress/summary?from=2026-10-01&to=2026-10-31&userId=99`, {
    headers: { Cookie: cookie },
  })
  assert.equal(summaryResponse.status, 200)
  const summary = await summaryResponse.json()
  assert.equal(summary.completedInRange, 3)
  assert.equal(summary.completionRate, 50)

  const completionResponse = await fetch(`${baseUrl}/api/progress/completions?groupBy=day&from=2026-10-01&to=2026-10-31`, {
    headers: { Cookie: cookie },
  })
  assert.equal(completionResponse.status, 200)
  assert.deepEqual((await completionResponse.json()).items, [{ period: '2026-10-20', completed: 3 }])

  const invalidGroup = await fetch(`${baseUrl}/api/progress/completions?groupBy=unknown&from=2026-10-01&to=2026-10-31`, {
    headers: { Cookie: cookie },
  })
  assert.equal(invalidGroup.status, 400)
})

test('ordinary users cannot access admin endpoints', async () => {
  let businessQueries = 0
  const baseUrl = await startServer(authenticatedQuery(async () => { businessQueries += 1; return [] }))
  const response = await fetch(`${baseUrl}/api/admin/stats`, { headers: { Cookie: cookie } })
  assert.equal(response.status, 403)
  assert.equal(businessQueries, 0)
})

test('task IDs outside the current owner scope are not disclosed', async () => {
  const baseUrl = await startServer(authenticatedQuery(async (sql, values) => {
    assert.match(sql, /WHERE id = \? AND owner_id = \?/)
    assert.deepEqual(values, [7, 42])
    return []
  }))
  const response = await fetch(`${baseUrl}/api/tasks/7`, { headers: { Cookie: cookie } })
  assert.equal(response.status, 404)
})

test('invalid task fields are rejected before task queries', async () => {
  let taskQueryCount = 0
  const baseUrl = await startServer(authenticatedQuery(async () => { taskQueryCount += 1; return [] }))
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Invalid dates', start_date: '2026-11-02', due_date: '2026-11-01' }),
  })
  assert.equal(response.status, 400)
  assert.equal(taskQueryCount, 0)
})

test('registration hashes passwords and never accepts a caller-supplied role', async () => {
  let values
  const baseUrl = await startServer(async (sql, params) => {
    if (sql.startsWith('SELECT id FROM users')) return []
    if (sql.startsWith('INSERT INTO users')) { values = params; return { insertId: 12 } }
    throw new Error(`Unexpected query: ${sql}`)
  })
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New Person',
      email: 'NEW@example.com',
      password: 'SecurePass123',
      passwordConfirmation: 'SecurePass123',
      role: 'admin',
    }),
  })
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { message: 'Đăng ký thành công. Vui lòng đăng nhập.' })
  assert.equal(values[0], 'New Person')
  assert.equal(values[1], 'new@example.com')
  assert.equal(values[3], 'user')
  assert.notEqual(values[2], 'SecurePass123')
  assert.equal(await bcrypt.compare('SecurePass123', values[2]), true)
})
