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

test('GET /metrics exposes Prometheus metrics', async () => {
  const response = await fetch(`${baseUrl}/metrics`)
  const metrics = await response.text()

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/plain/)
  assert.match(metrics, /# TYPE http_request_duration_seconds histogram/)
})
