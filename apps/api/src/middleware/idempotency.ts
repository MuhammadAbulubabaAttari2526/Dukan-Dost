import { createHash } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { ObjectId } from 'mongodb'
import type { Db } from 'mongodb'
import { HttpError } from '../utils/http.js'

export function requestHash(request: Request): string {
  return createHash('sha256')
    .update(JSON.stringify({ method: request.method, path: request.originalUrl, body: request.body ?? {} }))
    .digest('hex')
}

export async function executeIdempotent<T>(
  db: Db,
  key: { key: string; hash: string; shopId: ObjectId },
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) throw error
    const record = await db.collection('idempotencyKeys').findOne({ shopId: key.shopId, key: key.key })
    if (!record) throw error
    if (record.requestHash !== key.hash) {
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request')
    }
    return record.response as T
  }
}

export function requireIdempotencyKey(): RequestHandler {
  return (request, _response, next) => {
    const key = request.header('idempotency-key')
    if (!key || key.length < 8 || key.length > 200 || !/^[\w:.~-]+$/.test(key)) {
      next(new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required'))
      return
    }
    if (!request.tenant) {
      next(new HttpError(500, 'TENANT_CONTEXT_MISSING', 'Tenant authorization is required'))
      return
    }
    request.idempotency = { key, hash: requestHash(request), shopId: request.tenant.shopId }
    next()
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    idempotency?: { key: string; hash: string; shopId: ObjectId }
  }
}
