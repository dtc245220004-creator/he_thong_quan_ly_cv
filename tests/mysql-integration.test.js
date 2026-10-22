import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { after, test } from 'node:test'
import app from '../backend/src/app.js'
import { checkDatabaseConnection, pool, queryDatabase } from '../backend/src/db.js'

after(async () => {
  await pool.end()
})

test('MySQL CRUD API works against the configured database', async () => {
  await checkDatabaseConnection()
  const uniqueId = randomUUID()
  const title = `integration-${uniqueId}`
  const email = `integration-${uniqueId}@example.test`
  const otherEmail = `integration-other-${uniqueId}@example.test`
  const adminEmail = `integration-admin-${uniqueId}@example.test`
  const password = 'IntegrationPass123'
  const updatedPassword = 'IntegrationUpdated456'
  const server = app.listen(0)
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  let createdTask

  try {
    const health = await fetch(`${baseUrl}/health`)
    assert.equal(health.status, 200)

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test',
        email,
        password,
        passwordConfirmation: password,
      }),
    })
    assert.equal(registerResponse.status, 201)
    const duplicateResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test',
        email,
        password,
        passwordConfirmation: password,
      }),
    })
    assert.equal(duplicateResponse.status, 409)

    const wrongLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'IncorrectPass123' }),
    })
    assert.equal(wrongLogin.status, 401)

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(loginResponse.status, 200)
    const sessionCookie = loginResponse.headers.get('set-cookie')?.split(';')[0]
    assert.ok(sessionCookie)
    const headers = { Cookie: sessionCookie, 'Content-Type': 'application/json' }

    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers })
    assert.equal(profileResponse.status, 200)
    const profile = await profileResponse.json()
    assert.equal(profile.email, email)
    assert.equal(profile.stats.total, 0)
    assert.equal(profile.stats.completionRate, 0)
    const avatar = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nXcAAAAASUVORK5CYII=', 'base64')
    const avatarResponse = await fetch(`${baseUrl}/api/profile/avatar`, {
      method: 'PUT',
      headers: { Cookie: sessionCookie, 'Content-Type': 'image/png' },
      body: avatar,
    })
    assert.equal(avatarResponse.status, 200)
    assert.ok((await avatarResponse.json()).avatarVersion)
    const avatarRead = await fetch(`${baseUrl}/api/profile/avatar`, { headers: { Cookie: sessionCookie } })
    assert.equal(avatarRead.status, 200)
    assert.equal(avatarRead.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await avatarRead.arrayBuffer()), avatar)
    const invalidAvatar = await fetch(`${baseUrl}/api/profile/avatar`, {
      method: 'PUT',
      headers: { Cookie: sessionCookie, 'Content-Type': 'image/png' },
      body: Buffer.from('not an image'),
    })
    assert.equal(invalidAvatar.status, 400)
    const profileUpdate = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: '  Integration Updated  ', role: 'admin' }),
    })
    assert.equal(profileUpdate.status, 200)
    assert.equal((await profileUpdate.json()).name, 'Integration Updated')
    const invalidProfileUpdate = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'x' }),
    })
    assert.equal(invalidProfileUpdate.status, 400)
    const previousSmtp = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_FROM: process.env.SMTP_FROM,
    }
    delete process.env.SMTP_HOST
    delete process.env.SMTP_FROM
    try {
      const forgotResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      assert.equal(forgotResponse.status, 503)
      assert.match((await forgotResponse.json()).message, /chưa được cấu hình/)
    } finally {
      if (previousSmtp.SMTP_HOST === undefined) delete process.env.SMTP_HOST
      else process.env.SMTP_HOST = previousSmtp.SMTP_HOST
      if (previousSmtp.SMTP_FROM === undefined) delete process.env.SMTP_FROM
      else process.env.SMTP_FROM = previousSmtp.SMTP_FROM
    }

    const createResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title,
        description: 'Temporary MySQL integration test row',
        start_date: new Date().toISOString().slice(0, 10),
        due_date: new Date().toISOString().slice(0, 10),
        status: 'To do',
        priority: 'Medium',
      }),
    })
    assert.equal(createResponse.status, 201)
    createdTask = await createResponse.json()
    assert.equal(createdTask.title, title)
    assert.equal(createdTask.priority, 'Medium')
    const profileWithTask = await fetch(`${baseUrl}/api/profile`, { headers })
    assert.equal((await profileWithTask.json()).stats.total, 1)

    const secondLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(secondLogin.status, 200)
    const secondSessionCookie = secondLogin.headers.get('set-cookie')?.split(';')[0]
    assert.ok(secondSessionCookie)
    const invalidPasswordChange = await fetch(`${baseUrl}/api/profile/password`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        currentPassword: 'IncorrectPass123',
        newPassword: updatedPassword,
        passwordConfirmation: updatedPassword,
      }),
    })
    assert.equal(invalidPasswordChange.status, 401)
    const passwordChange = await fetch(`${baseUrl}/api/profile/password`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        currentPassword: password,
        newPassword: updatedPassword,
        passwordConfirmation: updatedPassword,
      }),
    })
    assert.equal(passwordChange.status, 200)
    assert.match((await passwordChange.json()).message, /phiên đăng nhập khác/)
    const revokedSession = await fetch(`${baseUrl}/api/tasks`, { headers: { Cookie: secondSessionCookie } })
    assert.equal(revokedSession.status, 401)
    const oldPasswordLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(oldPasswordLogin.status, 401)
    const newPasswordLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: updatedPassword }),
    })
    assert.equal(newPasswordLogin.status, 200)

    const otherRegister = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Other Integration User',
        email: otherEmail,
        password,
        passwordConfirmation: password,
      }),
    })
    assert.equal(otherRegister.status, 201)
    const otherLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password }),
    })
    assert.equal(otherLogin.status, 200)
    const otherCookie = otherLogin.headers.get('set-cookie')?.split(';')[0]
    assert.ok(otherCookie)
    const foreignTaskResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, {
      headers: { Cookie: otherCookie },
    })
    assert.equal(foreignTaskResponse.status, 404)
    const forbiddenAdminResponse = await fetch(`${baseUrl}/api/admin/stats`, { headers })
    assert.equal(forbiddenAdminResponse.status, 403)

    const today = new Date().toISOString().slice(0, 10)
    const calendarResponse = await fetch(`${baseUrl}/api/calendar?startDate=${today}&endDate=${today}`, { headers })
    assert.equal(calendarResponse.status, 200)
    assert.ok((await calendarResponse.json()).items.some((task) => task.id === createdTask.id))

    const detailResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, { headers })
    assert.equal(detailResponse.status, 200)
    assert.equal((await detailResponse.json()).title, title)

    const patchResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'In Progress', priority: 'High' }),
    })
    assert.equal(patchResponse.status, 200)
    const updatedTask = await patchResponse.json()
    assert.equal(updatedTask.status, 'In Progress')
    assert.equal(updatedTask.priority, 'High')

    const completedResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'Done' }),
    })
    assert.equal(completedResponse.status, 200)
    const completedTask = await completedResponse.json()
    assert.ok(completedTask.completed_at)
    const progressResponse = await fetch(`${baseUrl}/api/progress/completions?groupBy=day&from=${today}&to=${today}`, { headers })
    assert.equal(progressResponse.status, 200)
    assert.ok((await progressResponse.json()).items.some((item) => item.completed >= 1))
    const progressSummary = await fetch(`${baseUrl}/api/progress/summary?from=${today}&to=${today}&priority=High`, { headers })
    assert.equal(progressSummary.status, 200)
    const progressSummaryResult = await progressSummary.json()
    assert.equal(progressSummaryResult.completedInRange, 1)
    assert.equal(progressSummaryResult.completedFromCreated, 1)
    assert.equal(progressSummaryResult.comparedPeriodDays, 1)

    const reopenedResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'In Progress' }),
    })
    assert.equal(reopenedResponse.status, 200)
    assert.equal((await reopenedResponse.json()).completed_at, null)

    const adminRegister = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Admin',
        email: adminEmail,
        password,
        passwordConfirmation: password,
      }),
    })
    assert.equal(adminRegister.status, 201)
    await queryDatabase('UPDATE users SET role = ? WHERE email = ?', ['admin', adminEmail])
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password }),
    })
    assert.equal(adminLogin.status, 200)
    const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0]
    assert.ok(adminCookie)
    const adminHeaders = { Cookie: adminCookie, 'Content-Type': 'application/json' }
    const adminStats = await fetch(`${baseUrl}/api/admin/stats`, { headers: adminHeaders })
    assert.equal(adminStats.status, 200)
    const adminStatsResult = await adminStats.json()
    assert.ok(adminStatsResult.users.totalUsers >= 3)
    assert.ok(adminStatsResult.recentActivity.some((item) => item.action === 'auth.login' && item.actorEmail === adminEmail))
    const adminUsers = await fetch(`${baseUrl}/api/admin/users?search=${encodeURIComponent(otherEmail)}&page=1&limit=5`, { headers: adminHeaders })
    assert.equal(adminUsers.status, 200)
    const usersResult = await adminUsers.json()
    assert.equal(usersResult.items[0].email, otherEmail)
    assert.equal(Object.hasOwn(usersResult.items[0], 'password_hash'), false)
    const targetId = usersResult.items[0].id
    const userDetails = await fetch(`${baseUrl}/api/admin/users/${targetId}`, { headers: adminHeaders })
    assert.equal(userDetails.status, 200)
    const updateMember = await fetch(`${baseUrl}/api/admin/users/${targetId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Updated Integration Member' }),
    })
    assert.equal(updateMember.status, 200)
    assert.equal((await updateMember.json()).name, 'Updated Integration Member')
    const adminTasks = await fetch(`${baseUrl}/api/admin/tasks?limit=5`, { headers: adminHeaders })
    assert.equal(adminTasks.status, 200)
    assert.ok((await adminTasks.json()).items.length > 0)
    await queryDatabase('UPDATE tasks SET due_date = DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY) WHERE id = ?', [createdTask.id])
    const overdueTasks = await fetch(`${baseUrl}/api/admin/tasks?ownerId=${profile.id}&overdue=true`, { headers: adminHeaders })
    assert.equal(overdueTasks.status, 200)
    assert.ok((await overdueTasks.json()).items.some((task) => task.id === createdTask.id))
    const invalidOverdueFilter = await fetch(`${baseUrl}/api/admin/tasks?overdue=yes`, { headers: adminHeaders })
    assert.equal(invalidOverdueFilter.status, 400)

    const lockUser = await fetch(`${baseUrl}/api/admin/users/${targetId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    })
    assert.equal(lockUser.status, 200)
    const lockedRequest = await fetch(`${baseUrl}/api/tasks`, { headers: { Cookie: otherCookie } })
    assert.equal(lockedRequest.status, 401)
    const unlockUser = await fetch(`${baseUrl}/api/admin/users/${targetId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: true }),
    })
    assert.equal(unlockUser.status, 200)
    const grantRole = await fetch(`${baseUrl}/api/admin/users/${targetId}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'admin' }),
    })
    assert.equal(grantRole.status, 200)
    assert.equal((await grantRole.json()).role, 'admin')
    const revokeRole = await fetch(`${baseUrl}/api/admin/users/${targetId}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'user' }),
    })
    assert.equal(revokeRole.status, 200)
    assert.equal((await revokeRole.json()).role, 'user')
    const activity = await fetch(`${baseUrl}/api/admin/activity?limit=10`, { headers: adminHeaders })
    assert.equal(activity.status, 200)
    const activityResult = await activity.json()
    assert.ok(activityResult.total >= 4)
    assert.ok(activityResult.items.every((item) => item.description))
    const [adminRecord] = await queryDatabase('SELECT id FROM users WHERE email = ?', [adminEmail])
    const statusActivity = await fetch(
      `${baseUrl}/api/admin/activity?limit=100&action=user.status&adminId=${adminRecord.id}`,
      { headers: adminHeaders },
    )
    assert.equal(statusActivity.status, 200)
    const statusActivityResult = await statusActivity.json()
    assert.ok(statusActivityResult.total >= 2)
    assert.ok(statusActivityResult.items.every((item) => item.action === 'user.status'))
    const profileActivity = await fetch(
      `${baseUrl}/api/admin/activity?limit=100&action=user.profile`,
      { headers: adminHeaders },
    )
    assert.equal(profileActivity.status, 200)
    assert.ok((await profileActivity.json()).items.some((item) => item.targetId === targetId))
    const activityDate = String(statusActivityResult.items[0].created_at).slice(0, 10)
    const dateFilteredActivity = await fetch(
      `${baseUrl}/api/admin/activity?limit=100&action=user.status&from=${activityDate}&to=${activityDate}`,
      { headers: adminHeaders },
    )
    assert.equal(dateFilteredActivity.status, 200)
    assert.ok((await dateFilteredActivity.json()).total >= 2)
    const searchedActivity = await fetch(
      `${baseUrl}/api/admin/activity?limit=100&search=${encodeURIComponent('Vô hiệu hóa tài khoản thành viên')}`,
      { headers: adminHeaders },
    )
    assert.equal(searchedActivity.status, 200)
    assert.ok((await searchedActivity.json()).items.some((item) => item.action === 'user.status'))

    const listResponse = await fetch(`${baseUrl}/api/tasks`, { headers })
    assert.equal(listResponse.status, 200)
    assert.ok((await listResponse.json()).items.some((task) => task.id === createdTask.id))

    const deleteResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, {
      method: 'DELETE',
      headers,
    })
    assert.equal(deleteResponse.status, 204)

    const missingResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, { headers })
    assert.equal(missingResponse.status, 404)
    createdTask = null

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    })
    assert.equal(logoutResponse.status, 204)
    const privateAfterLogout = await fetch(`${baseUrl}/api/tasks`, { headers: { Cookie: sessionCookie } })
    assert.equal(privateAfterLogout.status, 401)
    const adminLogout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    assert.equal(adminLogout.status, 204)
    const loggedOutAdmin = await fetch(`${baseUrl}/api/admin/stats`, { headers: adminHeaders })
    assert.equal(loggedOutAdmin.status, 401)
    const logoutActivity = await queryDatabase(
      'SELECT id FROM admin_activity WHERE actor_id = (SELECT id FROM users WHERE email = ?) AND action = ?',
      [adminEmail, 'auth.logout'],
    )
    assert.ok(logoutActivity.length >= 1)
    const resetToken = randomBytes(32).toString('base64url')
    await queryDatabase(
      `INSERT INTO password_reset_tokens
         (user_id, email_hash, request_ip_hash, token_hash, expires_at)
       VALUES ((SELECT id FROM users WHERE email = ?), ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE))`,
      [email, 'e'.repeat(64), 'f'.repeat(64), createHash('sha256').update(resetToken).digest('hex')],
    )
    const resetPassword = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'IntegrationReset789',
        passwordConfirmation: 'IntegrationReset789',
      }),
    })
    assert.equal(resetPassword.status, 200)
    const reusedResetToken = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'IntegrationReset789',
        passwordConfirmation: 'IntegrationReset789',
      }),
    })
    assert.equal(reusedResetToken.status, 400)
    const resetLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'IntegrationReset789' }),
    })
    assert.equal(resetLogin.status, 200)
  } finally {
    if (createdTask) {
      await queryDatabase('DELETE FROM tasks WHERE id = ? AND title = ?', [createdTask.id, title])
    }
    for (const accountEmail of [email, otherEmail, adminEmail]) {
      await queryDatabase(
        'DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)',
        [accountEmail],
      )
      await queryDatabase(
        'DELETE FROM tasks WHERE owner_id IN (SELECT id FROM users WHERE email = ?)',
        [accountEmail],
      )
      await queryDatabase('DELETE FROM users WHERE email = ?', [accountEmail])
    }

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
})
