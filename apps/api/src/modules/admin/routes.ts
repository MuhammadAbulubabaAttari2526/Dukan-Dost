import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '../../middleware/auth.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'
import { serializeDocument } from '../../utils/serialization.js'
import { inTransaction } from '../../utils/transaction.js'

export function adminRouter(db: Db): Router {
  const router = Router()
  router.use(requireAuth(db), requireSuperAdmin)

  router.get('/shops', asyncRoute(async (_request, response) => {
    const shops = await db.collection('shops').find({}).sort({ createdAt: -1 }).limit(100).toArray()
    const data = await Promise.all(shops.map(async (shop) => {
      const membership = await db.collection('memberships').findOne({ shopId: shop._id, role: 'owner', active: true })
      const owner = membership ? await db.collection('users').findOne({ _id: membership.userId }, { projection: { name: 1, email: 1 } }) : null
      const [productCount, salesCount, lastAudit, subscriptionHistory] = await Promise.all([
        db.collection('products').countDocuments({ shopId: shop._id }),
        db.collection('sales').countDocuments({ shopId: shop._id }),
        db.collection('auditLogs').findOne({ shopId: shop._id }, { sort: { createdAt: -1 }, projection: { createdAt: 1 } }),
        db.collection('subscriptions').find({ shopId: shop._id }).sort({ createdAt: -1 }).limit(10).toArray(),
      ])
      return serializeDocument({
        ...shop,
        ownerName: owner?.name,
        ownerEmail: owner?.email,
        productCount,
        salesCount,
        lastActivity: lastAudit?.createdAt,
        subscriptionHistory,
      })
    }))
    sendData(response, data)
  }))

  router.patch('/shops/:shopId', asyncRoute(async (request, response) => {
    const shopIdValue = Array.isArray(request.params.shopId) ? request.params.shopId[0] : request.params.shopId
    if (!shopIdValue || !ObjectId.isValid(shopIdValue)) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found')
    const shopId = new ObjectId(shopIdValue)
    const body = z.object({
      status: z.enum(['active', 'suspended']).optional(),
      plan: z.enum(['starter', 'business']).optional(),
      subscriptionStatus: z.enum(['trial', 'active', 'past_due', 'expired', 'cancelled']).optional(),
      renewalDate: z.string().datetime().optional(),
    }).strict().parse(request.body) as Record<string, unknown>
    if (body.status !== undefined && body.status !== 'active' && body.status !== 'suspended') throw new HttpError(422, 'INVALID_STATUS', 'Shop status is invalid')
    if (body.plan !== undefined && body.plan !== 'starter' && body.plan !== 'business') throw new HttpError(422, 'INVALID_PLAN', 'Subscription plan is invalid')
    if (body.subscriptionStatus !== undefined && !['trial', 'active', 'past_due', 'expired', 'cancelled'].includes(String(body.subscriptionStatus))) throw new HttpError(422, 'INVALID_SUBSCRIPTION', 'Subscription status is invalid')
    if (body.renewalDate !== undefined && (typeof body.renewalDate !== 'string' || Number.isNaN(Date.parse(body.renewalDate)))) throw new HttpError(422, 'INVALID_RENEWAL_DATE', 'Renewal date is invalid')
    if (!Object.keys(body).length) throw new HttpError(422, 'EMPTY_UPDATE', 'Provide at least one administrative field')
    const update: Record<string, unknown> = { ...body, updatedAt: new Date() }
    if (typeof body.renewalDate === 'string') update.renewalDate = new Date(body.renewalDate)
    const updated = await inTransaction(db, async (session) => {
      const before = await db.collection('shops').findOne({ _id: shopId }, { session })
      if (!before) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found')
      await db.collection('shops').updateOne({ _id: shopId }, { $set: update }, { session })
      if (body.plan !== undefined || body.subscriptionStatus !== undefined || body.renewalDate !== undefined) {
        await db.collection('subscriptions').insertOne({
          shopId,
          plan: body.plan ?? before.plan,
          status: body.subscriptionStatus ?? before.subscriptionStatus,
          startDate: new Date(),
          renewalDate: update.renewalDate ?? before.renewalDate,
          note: 'Manual super-admin change',
          actorId: request.identity!.userId,
          createdAt: new Date(),
        }, { session })
      }
      await db.collection('adminAuditLogs').insertOne({
        actorId: request.identity!.userId,
        action: 'shop.admin_updated',
        shopId,
        before: { status: before.status, plan: before.plan, subscriptionStatus: before.subscriptionStatus, renewalDate: before.renewalDate },
        after: update,
        createdAt: new Date(),
      }, { session })
      return db.collection('shops').findOne({ _id: shopId }, { session })
    })
    sendData(response, updated ? serializeDocument(updated) : null)
  }))

  router.get('/audit', asyncRoute(async (request, response) => {
    const { page, limit } = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).strict().parse(request.query)
    const entries = await db.collection('adminAuditLogs').find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray()
    sendData(response, entries.map(serializeDocument))
  }))

  return router
}
