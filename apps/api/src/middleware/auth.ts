import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { ObjectId } from 'mongodb'
import { env } from '../config/env.js'
import { getDatabase } from '../db/connection.js'
import { HttpError } from '../utils/http.js'

export type ShopRole = 'owner' | 'manager' | 'cashier'
export type ApiRole = ShopRole | 'super_admin' | 'unassigned'

export interface AuthIdentity {
  userId: ObjectId
  role: ApiRole
  isSuperAdmin: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    identity?: AuthIdentity
    tenant?: { shopId: ObjectId; role: ShopRole }
  }
}

interface AccessClaims extends JwtPayload {
  sub: string
  typ: 'access'
  isSuperAdmin: boolean
  ver: number
  sid: string
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.cookie?.split(';') ?? []
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function requireAuth(db = getDatabase()): RequestHandler {
  return async (request, _response, next) => {
    try {
      const header = request.header('authorization')
      if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required')
      const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET)
      if (typeof payload === 'string' || payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !ObjectId.isValid(payload.sub)) {
        throw new HttpError(401, 'INVALID_TOKEN', 'Authentication token is invalid')
      }
      const claims = payload as AccessClaims
      const userId = new ObjectId(claims.sub)
      const user = await db.collection('users').findOne(
        { _id: userId, disabledAt: { $exists: false } },
        { projection: { isSuperAdmin: 1, tokenVersion: 1 } },
      )
      if (!user) throw new HttpError(401, 'INVALID_TOKEN', 'Authentication token is invalid')
      if (claims.ver !== Number(user.tokenVersion ?? 0)) throw new HttpError(401, 'SESSION_REVOKED', 'Session is no longer valid')
      const activeSession = await db.collection('refreshTokens').findOne({
        familyId: claims.sid,
        userId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      }, { projection: { _id: 1 } })
      if (!activeSession) throw new HttpError(401, 'SESSION_REVOKED', 'Session is no longer valid')
      request.identity = {
        userId,
        role: user.isSuperAdmin === true ? 'super_admin' : 'unassigned',
        isSuperAdmin: user.isSuperAdmin === true,
      }
      next()
    } catch (error) {
      next(error instanceof HttpError ? error : new HttpError(401, 'INVALID_TOKEN', 'Authentication token is invalid'))
    }
  }
}

export const requireSuperAdmin: RequestHandler = (request, _response, next) => {
  if (!request.identity?.isSuperAdmin) {
    next(new HttpError(403, 'FORBIDDEN', 'Super-admin access is required'))
    return
  }
  next()
}

export function requireRole(...roles: ShopRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.tenant || !roles.includes(request.tenant.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'Your shop role cannot perform this action'))
      return
    }
    next()
  }
}

export function requireTenant(db = getDatabase()): RequestHandler {
  return async (request, _response, next) => {
    try {
      const identity = request.identity
      const requestedValue = request.params.shopId
      const requestedId = Array.isArray(requestedValue) ? requestedValue[0] : requestedValue
      if (!identity || !requestedId || !ObjectId.isValid(requestedId)) {
        throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found')
      }
      if (identity.isSuperAdmin) throw new HttpError(403, 'FORBIDDEN', 'Super-admins must use audited admin endpoints')
      const shopId = new ObjectId(requestedId)
      const [membership, shop] = await Promise.all([
        db.collection('memberships').findOne({
          shopId,
          userId: identity.userId,
          active: true,
        }),
        db.collection('shops').findOne({ _id: shopId }, { projection: { status: 1 } }),
      ])
      if (!membership || !shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found')
      if (membership.role !== 'owner' && membership.role !== 'manager' && membership.role !== 'cashier') {
        throw new HttpError(403, 'FORBIDDEN', 'Shop membership is invalid')
      }
      request.tenant = { shopId, role: membership.role }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireBusinessAccess(db = getDatabase()): RequestHandler {
  return async (request, _response, next) => {
    try {
      if (!request.tenant) throw new HttpError(500, 'TENANT_CONTEXT_MISSING', 'Tenant authorization is required')
      const shop = await db.collection('shops').findOne(
        { _id: request.tenant.shopId },
        { projection: { status: 1, subscriptionStatus: 1, renewalDate: 1 } },
      )
      const renewalDate = shop?.renewalDate instanceof Date ? shop.renewalDate : new Date(String(shop?.renewalDate ?? ''))
      if (!shop || shop.status !== 'active' || !['trial', 'active'].includes(String(shop.subscriptionStatus)) || Number.isNaN(renewalDate.getTime()) || renewalDate.getTime() < Date.now()) {
        throw new HttpError(403, 'SUBSCRIPTION_BLOCKED', 'This shop cannot create business records while its subscription is inactive')
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function profileRole(identity: AuthIdentity): ApiRole {
  return identity.isSuperAdmin ? 'super_admin' : identity.role
}
