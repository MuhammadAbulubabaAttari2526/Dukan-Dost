import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { z } from 'zod'
import { requireAuth, requireTenant } from '../../middleware/auth.js'
import { roleCan } from '../../lib/permissions.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'
import { inTransaction } from '../../utils/transaction.js'
import { serializeDocument } from '../../utils/serialization.js'

const createShopSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(5).max(40),
  address: z.string().trim().min(3).max(300),
  logoUrl: z.string().url().max(2048).refine((value) => value.startsWith('https://'), 'Logo URL must use HTTPS').optional(),
}).strict()

const listLimits = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()

export function shopRouter(db: Db): Router {
  const router = Router()
  router.use(requireAuth(db))

  router.post('/', asyncRoute(async (request, response) => {
    const input = createShopSchema.parse(request.body)
    const userId = request.identity!.userId
    const existing = await db.collection('memberships').findOne({ userId, active: true })
    if (existing) throw new HttpError(409, 'SHOP_ALREADY_ASSIGNED', 'This account already belongs to a shop')

    const shopId = new ObjectId()
    const now = new Date()
    const renewalDate = new Date(now.getTime() + 14 * 24 * 60 * 60_000)
    await inTransaction(db, async (session) => {
      await db.collection('shops').insertOne({
        _id: shopId,
        ...input,
        status: 'active',
        plan: 'starter',
        subscriptionStatus: 'trial',
        trialStartDate: now,
        renewalDate,
        createdAt: now,
        updatedAt: now,
      }, { session })
      await db.collection('memberships').insertOne({
        shopId,
        userId,
        role: 'owner',
        active: true,
        createdAt: now,
      }, { session })
      await db.collection('subscriptions').insertOne({
        shopId,
        plan: 'starter',
        status: 'trial',
        startDate: now,
        renewalDate,
        createdAt: now,
        note: '14-day trial',
      }, { session })
      await db.collection('auditLogs').insertOne({
        shopId,
        actorId: userId,
        action: 'shop.created',
        entity: 'shop',
        entityId: shopId,
        createdAt: now,
      }, { session })
    })
    sendData(response, { shopId: shopId.toHexString() }, 201)
  }))

  router.use('/:shopId', requireTenant(db))

  router.get('/:shopId/bootstrap', asyncRoute(async (request, response) => {
    const tenant = request.tenant!
    const { page, limit } = listLimits.parse(request.query)
    const skip = (page - 1) * limit
    const cashier = tenant.role === 'cashier'
    const collectionNames = cashier
      ? ['products', 'sales', 'customers']
      : ['products', 'sales', 'customers', 'ledgerEntries', 'payments', 'suppliers', 'purchases', 'expenses', 'stockMovements', 'auditLogs', 'subscriptions']
    const data: Record<string, unknown[]> = {}
    await Promise.all(collectionNames.map(async (name) => {
      const filter: Record<string, unknown> = { shopId: tenant.shopId }
      if (cashier && name === 'sales') filter.cashierId = request.identity!.userId
      const records = await db.collection(name).find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()
      data[name === 'ledgerEntries' ? 'ledger' : name] = records.map((record) => serializeDocument(record) as Record<string, unknown>)
    }))
    if (cashier) {
      data.products = (data.products ?? []).map((product) => {
        const safeProduct = { ...(product as Record<string, unknown>) }
        delete safeProduct.cost
        delete safeProduct.supplierId
        return safeProduct
      })
      data.customers = (data.customers ?? []).map((customer) => {
        const safeCustomer = { ...(customer as Record<string, unknown>) }
        delete safeCustomer.email
        delete safeCustomer.address
        return safeCustomer
      })
    }
    sendData(response, data, 200)
  }))

  router.get('/:shopId', asyncRoute(async (request, response) => {
    const shop = await db.collection('shops').findOne({ _id: request.tenant!.shopId })
    if (!shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found')
    const safe = { ...shop }
    delete (safe as Record<string, unknown>).paymentProviderDetails
    sendData(response, serializeDocument(safe))
  }))

  router.patch('/:shopId', asyncRoute(async (request, response) => {
    if (!roleCan(request.tenant!.role, 'settings')) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can update shop settings')
    const input = createShopSchema.partial().strict().parse(request.body)
    if (Object.keys(input).length === 0) throw new HttpError(422, 'EMPTY_UPDATE', 'Provide at least one setting to update')
    await db.collection('shops').updateOne({ _id: request.tenant!.shopId }, { $set: { ...input, updatedAt: new Date() } })
    await db.collection('auditLogs').insertOne({
      shopId: request.tenant!.shopId,
      actorId: request.identity!.userId,
      action: 'shop.updated',
      entity: 'shop',
      entityId: request.tenant!.shopId,
      after: input,
      createdAt: new Date(),
    })
    const updated = await db.collection('shops').findOne({ _id: request.tenant!.shopId })
    sendData(response, updated ? serializeDocument(updated) : null)
  }))

  router.get('/:shopId/subscriptions', asyncRoute(async (request, response) => {
    if (!roleCan(request.tenant!.role, 'settings')) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can view subscription history')
    const { page, limit } = listLimits.parse(request.query)
    const rows = await db.collection('subscriptions').find({ shopId: request.tenant!.shopId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray()
    sendData(response, rows.map(serializeDocument))
  }))

  router.get('/:shopId/audit', asyncRoute(async (request, response) => {
    if (!roleCan(request.tenant!.role, 'settings')) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can view audit history')
    const { page, limit } = listLimits.parse(request.query)
    const rows = await db.collection('auditLogs').find({ shopId: request.tenant!.shopId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray()
    sendData(response, rows.map(serializeDocument))
  }))

  return router
}
