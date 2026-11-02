import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Db } from 'mongodb'
import { createApp } from '../src/app.js'

const database = { command: async () => ({ ok: 1 }) } as unknown as Db
const app = createApp(database)

describe('API app', () => {
  it('exposes an unauthenticated liveness check', async () => {
    const response = await request(app).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('ok')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('checks database readiness and returns a versioned API 404 envelope', async () => {
    const ready = await request(app).get('/ready')
    expect(ready.status).toBe(200)
    expect(ready.body.data.status).toBe('ready')

    const missing = await request(app).get('/api/v1/not-found')
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })
})
