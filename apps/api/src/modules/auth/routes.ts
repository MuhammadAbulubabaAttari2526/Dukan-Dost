import { randomBytes, randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { ObjectId, type Db } from 'mongodb'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { hashToken, readCookie, requireAuth, safeEqual } from '../../middleware/auth.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
}).strict()
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
}).strict()
const resetRequestSchema = z.object({ email: z.string().trim().email().max(254) }).strict()
const resetSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(128) }).strict()
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: z.string().min(12).max(128),
}).strict()
const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(100) }).strict()

const REFRESH_COOKIE = 'dd_refresh'
const CSRF_COOKIE = 'dd_csrf'
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60_000
const RESET_TTL_MS = 30 * 60_000

interface UserRecord {
  _id: ObjectId
  name: string
  email: string
  emailLower: string
  passwordHash: string
  isSuperAdmin?: boolean
  tokenVersion?: number
  createdAt: Date
  disabledAt?: Date
}

interface PublicUser {
  id: string
  name: string
  email: string
  role: 'owner' | 'manager' | 'cashier' | 'super_admin' | 'unassigned'
  isSuperAdmin: boolean
}

function publicUser(user: UserRecord, role: PublicUser['role']): PublicUser {
  return { id: user._id.toHexString(), name: user.name, email: user.email, role, isSuperAdmin: user.isSuperAdmin === true }
}

function signAccessToken(user: UserRecord, sessionId: string): string {
  const options: SignOptions = { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] }
  return jwt.sign({ typ: 'access', isSuperAdmin: user.isSuperAdmin === true, ver: user.tokenVersion ?? 0, sid: sessionId }, env.JWT_ACCESS_SECRET, {
    ...options,
    subject: user._id.toHexString(),
  })
}

function cookieOptions(maxAge: number, httpOnly: boolean) {
  const sameSite = env.COOKIE_SAME_SITE === 'strict' ? 'Strict' : env.COOKIE_SAME_SITE === 'none' ? 'None' : 'Lax'
  const domain = env.COOKIE_DOMAIN ? `; Domain=${env.COOKIE_DOMAIN}` : ''
  return `Path=/; Max-Age=${Math.floor(maxAge / 1000)}; SameSite=${sameSite}${env.COOKIE_SECURE ? '; Secure' : ''}${httpOnly ? '; HttpOnly' : ''}${domain}`
}

function setSessionCookies(response: Response, refreshToken: string, csrfToken: string): void {
  const expiresAt = env.REFRESH_TOKEN_DAYS * 24 * 60 * 60_000
  response.appendHeader('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieOptions(expiresAt, true)}`)
  response.appendHeader('Set-Cookie', `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${cookieOptions(expiresAt, false)}`)
}

function clearSessionCookies(response: Response): void {
  const expired = cookieOptions(0, true)
  response.appendHeader('Set-Cookie', `${REFRESH_COOKIE}=; ${expired}`)
  response.appendHeader('Set-Cookie', `${CSRF_COOKIE}=; ${cookieOptions(0, false)}`)
}

async function writeAudit(db: Db, action: string, userId: ObjectId, request: Request): Promise<void> {
  await db.collection('authAuditLogs').insertOne({
    action,
    userId,
    ip: request.ip,
    createdAt: new Date(),
  })
}

function requireCsrf(request: Request): void {
  const cookie = readCookie(request, CSRF_COOKIE)
  const header = request.header('x-csrf-token')
  if (!cookie || !header || !safeEqual(cookie, header)) {
    throw new HttpError(403, 'CSRF_INVALID', 'CSRF validation failed')
  }
}

async function issueRefresh(db: Db, user: UserRecord, familyId: string = randomUUID()): Promise<{ refreshToken: string; csrfToken: string; familyId: string }> {
  const refreshToken = randomBytes(48).toString('base64url')
  const csrfToken = randomBytes(32).toString('base64url')
  const now = new Date()
  await db.collection('refreshTokens').insertOne({
    tokenHash: hashToken(refreshToken),
    csrfHash: hashToken(csrfToken),
    userId: user._id,
    familyId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60_000),
  })
  return { refreshToken, csrfToken, familyId }
}

function authLimiter() {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
  })
}

export function authRouter(db: Db): Router {
  const router = Router()
  router.use(authLimiter())

  router.post('/register', asyncRoute(async (request, response) => {
    const input = registerSchema.parse(request.body)
    const emailLower = input.email.toLowerCase()
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id })
    const user: UserRecord = {
      _id: new ObjectId(),
      name: input.name,
      email: input.email,
      emailLower,
      passwordHash,
      tokenVersion: 0,
      createdAt: new Date(),
    }
    try {
      await db.collection<UserRecord>('users').insertOne(user)
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new HttpError(409, 'EMAIL_UNAVAILABLE', 'An account could not be created with those details')
      }
      throw error
    }
    await writeAudit(db, 'auth.register', user._id, request)
    const refresh = await issueRefresh(db, user)
    setSessionCookies(response, refresh.refreshToken, refresh.csrfToken)
    sendData(response, { accessToken: signAccessToken(user, refresh.familyId), user: publicUser(user, 'unassigned') }, 201)
  }))

  router.post('/login', asyncRoute(async (request, response) => {
    const input = loginSchema.parse(request.body)
    const emailLower = input.email.toLowerCase()
    const attemptKeys = [`email:${emailLower}`, `ip:${request.ip ?? 'unknown'}`]
    const attempts = await db.collection('loginAttempts').find({ key: { $in: attemptKeys }, expiresAt: { $gt: new Date() } }).toArray()
    if (attempts.some((entry) => Number(entry.attempts) >= MAX_LOGIN_ATTEMPTS)) {
      throw new HttpError(429, 'LOGIN_LOCKED', 'Too many sign-in attempts. Try again later.')
    }
    const user = await db.collection<UserRecord>('users').findOne({ emailLower, disabledAt: { $exists: false } })
    const valid = user ? await argon2.verify(user.passwordHash, input.password) : false
    if (!user || !valid) {
      const expiresAt = new Date(Date.now() + LOGIN_WINDOW_MS)
      for (const key of attemptKeys) {
        await db.collection('loginAttempts').updateOne(
          { key },
          { $inc: { attempts: 1 }, $set: { expiresAt } },
          { upsert: true },
        )
      }
      await writeAudit(db, 'auth.login_failed', user?._id ?? new ObjectId(), request)
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
    }
    await db.collection('loginAttempts').deleteMany({ key: { $in: attemptKeys } })
    const membership = await db.collection('memberships').findOne({ userId: user._id, active: true })
    const role = user.isSuperAdmin ? 'super_admin' : membership?.role ?? 'unassigned'
    await writeAudit(db, 'auth.login', user._id, request)
    const refresh = await issueRefresh(db, user)
    setSessionCookies(response, refresh.refreshToken, refresh.csrfToken)
    sendData(response, { accessToken: signAccessToken(user, refresh.familyId), user: publicUser(user, role) })
  }))

  router.post('/refresh', asyncRoute(async (request, response) => {
    requireCsrf(request)
    const token = readCookie(request, REFRESH_COOKIE)
    if (!token) throw new HttpError(401, 'REFRESH_INVALID', 'Session refresh is required')
    const hash = hashToken(token)
    const session = await db.collection('refreshTokens').findOne({ tokenHash: hash })
    if (!session) throw new HttpError(401, 'REFRESH_INVALID', 'Session refresh is invalid')
    if (session.revokedAt) {
      await db.collection('refreshTokens').updateMany({ familyId: session.familyId }, { $set: { revokedAt: new Date(), revokeReason: 'reuse_detected' } })
      clearSessionCookies(response)
      throw new HttpError(401, 'REFRESH_REUSE', 'Session is no longer valid. Sign in again.')
    }
    if (!(session.expiresAt instanceof Date) || session.expiresAt <= new Date()) {
      clearSessionCookies(response)
      throw new HttpError(401, 'REFRESH_EXPIRED', 'Session has expired. Sign in again.')
    }
    const csrfHeader = request.header('x-csrf-token')
    if (!csrfHeader || typeof session.csrfHash !== 'string' || !safeEqual(hashToken(csrfHeader), session.csrfHash)) {
      throw new HttpError(403, 'CSRF_INVALID', 'CSRF validation failed')
    }
    const user = await db.collection<UserRecord>('users').findOne({ _id: session.userId, disabledAt: { $exists: false } })
    if (!user) throw new HttpError(401, 'REFRESH_INVALID', 'Session is invalid')
    const rotated = await db.collection('refreshTokens').updateOne(
      { _id: session._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokeReason: 'rotated' } },
    )
    if (rotated.modifiedCount !== 1) {
      await db.collection('refreshTokens').updateMany({ familyId: session.familyId }, { $set: { revokedAt: new Date(), revokeReason: 'reuse_detected' } })
      throw new HttpError(401, 'REFRESH_REUSE', 'Session is no longer valid. Sign in again.')
    }
    const refresh = await issueRefresh(db, user, String(session.familyId))
    setSessionCookies(response, refresh.refreshToken, refresh.csrfToken)
    const membership = await db.collection('memberships').findOne({ userId: user._id, active: true })
    const role = user.isSuperAdmin ? 'super_admin' : membership?.role ?? 'unassigned'
    sendData(response, { accessToken: signAccessToken(user, refresh.familyId), user: publicUser(user, role) })
  }))

  router.post('/logout', asyncRoute(async (request, response) => {
    const token = readCookie(request, REFRESH_COOKIE)
    if (token) {
      await db.collection('refreshTokens').updateOne(
        { tokenHash: hashToken(token), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokeReason: 'logout' } },
      )
    }
    clearSessionCookies(response)
    response.status(204).end()
  }))

  router.post('/forgot-password', asyncRoute(async (request, response) => {
    const { email } = resetRequestSchema.parse(request.body)
    const user = await db.collection<UserRecord>('users').findOne({ emailLower: email.toLowerCase(), disabledAt: { $exists: false } })
    if (user) {
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(Date.now() + RESET_TTL_MS)
      await db.collection('passwordResetTokens').insertOne({ tokenHash: hashToken(token), userId: user._id, createdAt: new Date(), expiresAt })
      if (env.NODE_ENV === 'development') logger.info({ resetToken: token }, 'Development password reset token')
    }
    sendData(response, { message: 'If an account exists for that email, reset instructions will be sent.' })
  }))

  router.post('/reset-password', asyncRoute(async (request, response) => {
    const { token, password } = resetSchema.parse(request.body)
    const reset = await db.collection('passwordResetTokens').findOne({ tokenHash: hashToken(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    if (!reset) throw new HttpError(400, 'RESET_INVALID', 'Password reset token is invalid or expired')
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    const used = await db.collection('passwordResetTokens').updateOne(
      { _id: reset._id, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    )
    if (used.modifiedCount !== 1) throw new HttpError(400, 'RESET_INVALID', 'Password reset token is invalid or expired')
    await db.collection('users').updateOne({ _id: reset.userId }, { $set: { passwordHash, passwordChangedAt: new Date() }, $inc: { tokenVersion: 1 } })
    await db.collection('refreshTokens').updateMany({ userId: reset.userId }, { $set: { revokedAt: new Date(), revokeReason: 'password_reset' } })
    await writeAudit(db, 'auth.password_reset', reset.userId, request)
    sendData(response, { message: 'Password has been reset. Sign in with your new password.' })
  }))

  router.use(requireAuth(db))

  router.get('/me', asyncRoute(async (request, response) => {
    const user = await db.collection<UserRecord>('users').findOne({ _id: request.identity!.userId, disabledAt: { $exists: false } })
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found')
    const membership = await db.collection('memberships').findOne({ userId: user._id, active: true })
    const role = user.isSuperAdmin ? 'super_admin' : membership?.role ?? 'unassigned'
    const shopId = membership?.shopId instanceof ObjectId ? membership.shopId : undefined
    const shop = shopId ? await db.collection('shops').findOne({ _id: shopId }, { projection: { name: 1, contact: 1, address: 1, logoUrl: 1, status: 1, plan: 1, subscriptionStatus: 1, renewalDate: 1, createdAt: 1 } }) : null
    sendData(response, {
      user: publicUser(user, role),
      shop: shop ? {
        id: shop._id.toString(),
        name: shop.name,
        contact: shop.contact,
        address: shop.address,
        logoUrl: shop.logoUrl,
        status: shop.status,
        plan: shop.plan,
        subscriptionStatus: shop.subscriptionStatus,
        renewalDate: shop.renewalDate instanceof Date ? shop.renewalDate.toISOString() : shop.renewalDate,
        createdAt: shop.createdAt instanceof Date ? shop.createdAt.toISOString() : shop.createdAt,
      } : null,
    })
  }))

  router.patch('/me', asyncRoute(async (request, response) => {
    const { name } = updateProfileSchema.parse(request.body)
    const userId = request.identity!.userId
    await db.collection('users').updateOne({ _id: userId }, { $set: { name, updatedAt: new Date() } })
    const user = await db.collection<UserRecord>('users').findOne({ _id: userId })
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found')
    const membership = await db.collection('memberships').findOne({ userId, active: true })
    sendData(response, { user: publicUser(user, user.isSuperAdmin ? 'super_admin' : membership?.role ?? 'unassigned') })
  }))

  router.post('/change-password', asyncRoute(async (request, response) => {
    const { currentPassword, password } = changePasswordSchema.parse(request.body)
    const userId = request.identity!.userId
    const user = await db.collection<UserRecord>('users').findOne({ _id: userId, disabledAt: { $exists: false } })
    if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect')
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    await db.collection('users').updateOne({ _id: userId }, { $set: { passwordHash, passwordChangedAt: new Date() }, $inc: { tokenVersion: 1 } })
    await db.collection('refreshTokens').updateMany({ userId }, { $set: { revokedAt: new Date(), revokeReason: 'password_changed' } })
    await writeAudit(db, 'auth.password_changed', userId, request)
    clearSessionCookies(response)
    sendData(response, { message: 'Password changed. Sign in again on your devices.' })
  }))

  router.get('/sessions', asyncRoute(async (request, response) => {
    const sessions = await db.collection('refreshTokens').find({
      userId: request.identity!.userId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }, { projection: { familyId: 1, createdAt: 1, expiresAt: 1 } }).sort({ createdAt: -1 }).limit(50).toArray()
    sendData(response, sessions.map((session) => ({
      id: session._id.toString(),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })))
  }))

  router.delete('/sessions/:sessionId', asyncRoute(async (request, response) => {
    const value = Array.isArray(request.params.sessionId) ? request.params.sessionId[0] : request.params.sessionId
    if (!value || !ObjectId.isValid(value)) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found')
    const result = await db.collection('refreshTokens').updateOne(
      { _id: new ObjectId(value), userId: request.identity!.userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokeReason: 'user_revoked' } },
    )
    if (result.modifiedCount !== 1) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found')
    sendData(response, { revoked: true })
  }))

  router.post('/logout-all', asyncRoute(async (request, response) => {
    const userId = request.identity!.userId
    await db.collection('users').updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } })
    await db.collection('refreshTokens').updateMany({ userId, revokedAt: { $exists: false } }, {
      $set: { revokedAt: new Date(), revokeReason: 'logout_all' },
    })
    clearSessionCookies(response)
    sendData(response, { loggedOut: true })
  }))

  return router
}
