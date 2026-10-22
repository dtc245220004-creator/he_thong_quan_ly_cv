import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toPostgresParameters } from '../backend/src/db.js'

test('PostgreSQL parameter conversion skips quoted strings and identifiers', () => {
  assert.equal(
    toPostgresParameters(`SELECT ?, '?' AS literal, "?" AS identifier, ?`),
    `SELECT $1, '?' AS literal, "?" AS identifier, $2`,
  )
})
