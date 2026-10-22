import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import app from '../backend/src/app.js'

let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await once(server, 'listening')

  const { port } = server.address()
  baseUrl = `http://127.0.0.1:${port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
})

test('GET /health reports that the backend is running', async () => {
  const response = await fetch(`${baseUrl}/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})
