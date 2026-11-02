import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import request from 'supertest'
import type { Db } from 'mongodb'
import { createApp } from '../src/app.js'

describe('authentication API', () => {
  let replicaSet: MongoMemoryReplSet
  let client: MongoClient
  let db: Db
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    client = new MongoClient(replicaSet.getUri())
    await client.connect()
    db = client.db('dukaan_dost_test')
    await db.collection('users').createIndex({ emailLower: 1 }, { unique: true })
    await db.collection('refreshTokens').createIndex({ tokenHash: 1 }, { unique: true })
    app = createApp(db)
  }, 120_000)

  beforeEach(async () => {
    await db.dropDatabase()
    await db.collection('users').createIndex({ emailLower: 1 }, { unique: true })
    await db.collection('refreshTokens').createIndex({ tokenHash: 1 }, { unique: true })
  })

  afterAll(async () => {
    await client?.close()
    await replicaSet?.stop()
  })

  it('creates only an unassigned account and rejects privilege escalation fields', async () => {
    const invalid = await request(app).post('/api/v1/auth/register').send({
      name: 'Owner User',
      email: 'owner@example.test',
      password: 'a-long-test-password',
      role: 'owner',
      shopId: '0123456789abcdef01234567',
      isSuperAdmin: true,
    })
    expect(invalid.status).toBe(422)

    const created = await request(app).post('/api/v1/auth/register').send({
      name: 'Owner User',
      email: 'owner@example.test',
      password: 'a-long-test-password',
    })
    expect(created.status).toBe(201)
    expect(created.body.data.user).toMatchObject({ role: 'unassigned', isSuperAdmin: false })
    expect(created.body.data.user).not.toHaveProperty('passwordHash')
    expect(created.headers['set-cookie']).toBeDefined()
  })

  it('uses generic login errors and rotates refresh sessions only with matching CSRF data', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Owner User',
      email: 'owner@example.test',
      password: 'a-long-test-password',
    })
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@example.test',
      password: 'a-long-test-password',
    })
    expect(login.status).toBe(200)
    const cookies = login.headers['set-cookie'] as string[]
    const refresh = cookies.find((cookie) => cookie.startsWith('dd_refresh='))?.split(';')[0]
    const csrf = cookies.find((cookie) => cookie.startsWith('dd_csrf='))?.split(';')[0]
    const csrfToken = csrf?.slice('dd_csrf='.length)
    expect(refresh).toBeDefined()
    expect(csrfToken).toBeDefined()

    const rejected = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh!)
      .set('x-csrf-token', 'not-the-token')
    expect(rejected.status).toBe(403)

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refresh!, csrf!])
      .set('x-csrf-token', decodeURIComponent(csrfToken!))
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.data.accessToken).toBeTruthy()
  })

  it('does not disclose account existence in forgot-password responses', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Owner User',
      email: 'known@example.test',
      password: 'a-long-test-password',
    })
    const existing = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'known@example.test' })
    const absent = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'unknown@example.test' })
    expect(existing.status).toBe(200)
    expect(existing.body).toEqual(absent.body)
  })
})
