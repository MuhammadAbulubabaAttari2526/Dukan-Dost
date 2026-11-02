import { Router, type Request } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { z } from 'zod'
import { requireBusinessAccess, requireRole, requireTenant } from '../../middleware/auth.js'
import { requireAuth } from '../../middleware/auth.js'
import { executeIdempotent, requireIdempotencyKey } from '../../middleware/idempotency.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'
import { toPaisa } from '../../utils/money.js'
import { serializeDocument } from '../../utils/serialization.js'
import { inTransaction } from '../../utils/transaction.js'
import { allocateDiscountPaisa, returnLineAmountPaisa } from '../../utils/accounting.js'

const saleSchema = z.object({
  items: z.array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().positive().max(100_000) }).strict()).min(1).max(100)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, 'Each product may appear only once'),
  discount: z.number().finite().nonnegative().default(0),
  paymentMethod: z.enum(['cash', 'digital', 'credit']),
  amountPaid: z.number().finite().nonnegative(),
  customerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict()
const returnSchema = z.object({
  items: z.array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().positive() }).strict())
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, 'Each returned product may appear only once').optional(),
  reason: z.string().trim().min(2).max(300),
  refundMethod: z.enum(['cash', 'digital', 'credit']).default('cash'),
}).strict()
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(100).optional(),
  status: z.enum(['completed', 'returned', 'cancelled']).optional(),
  paymentMethod: z.enum(['cash', 'digital', 'credit']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict()

const roleDiscountLimit: Record<string, number> = { cashier: 0.05, manager: 0.2, owner: 1 }

function assertId(id: string | string[] | undefined, code: string): ObjectId {
  const value = Array.isArray(id) ? id[0] : id
  if (!value || !ObjectId.isValid(value)) throw new HttpError(404, code, 'Record not found')
  return new ObjectId(value)
}

function keyFor(request: Request & { idempotency?: { key: string; hash: string; shopId: ObjectId } }) {
  const key = request.idempotency
  if (!key) throw new HttpError(500, 'IDEMPOTENCY_MISSING', 'Idempotency middleware is required')
  return key
}

export function salesRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  router.use(requireAuth(db), requireTenant(db))

  router.get('/', asyncRoute(async (request, response) => {
    const filters = listSchema.parse(request.query)
    const shopId = request.tenant!.shopId
    const query: Record<string, unknown> = { shopId }
    if (filters.status) query.status = filters.status
    if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod
    if (filters.from || filters.to) {
      query.createdAt = {
        ...(filters.from ? { $gte: new Date(filters.from) } : {}),
        ...(filters.to ? { $lte: new Date(filters.to) } : {}),
      }
    }
    if (request.tenant!.role === 'cashier') query.cashierId = request.identity!.userId
    if (filters.search) {
      const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.$or = [{ receiptNumber: { $regex: escaped, $options: 'i' } }, { customerName: { $regex: `^${escaped}`, $options: 'i' } }]
    }
    const [sales, total] = await Promise.all([
      db.collection('sales').find(query).sort({ createdAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit).toArray(),
      db.collection('sales').countDocuments(query),
    ])
    const data = sales.map((sale) => {
      const safe = serializeDocument(sale) as Record<string, unknown>
      if (request.tenant!.role === 'cashier') {
        safe.items = (safe.items as Array<Record<string, unknown>> | undefined)?.map((item) => {
          const visibleItem = { ...item }
          delete visibleItem.cost
          return visibleItem
        })
      }
      return safe
    })
    response.json({ data, meta: { page: filters.page, limit: filters.limit, total, nextCursor: filters.page * filters.limit < total ? String(filters.page + 1) : null } })
  }))

  router.post('/', requireRole('owner', 'manager', 'cashier'), requireBusinessAccess(db), requireIdempotencyKey(), asyncRoute(async (request, response) => {
    const input = saleSchema.parse(request.body)
    const idem = keyFor(request)
    const shopId = request.tenant!.shopId
    const actorId = request.identity!.userId
    const existing = await db.collection('idempotencyKeys').findOne({ shopId, key: idem.key })
    if (existing) {
      if (existing.requestHash !== idem.hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request')
      sendData(response, existing.response)
      return
    }

    const quantities = new Map<string, number>()
    for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
    const responseBody = await executeIdempotent(db, idem, () => inTransaction(db, async (session) => {
      const products = await db.collection('products').find({
        shopId,
        archived: false,
        _id: { $in: [...quantities.keys()].map((id) => new ObjectId(id)) },
      }, { session }).toArray()
      if (products.length !== quantities.size) throw new HttpError(422, 'PRODUCT_UNAVAILABLE', 'A selected product is no longer available')
      const productById = new Map(products.map((product) => [product._id.toHexString(), product]))
      const role = request.tenant!.role
      const discountLimit = roleDiscountLimit[role] ?? 0
      const subtotalPaisa = input.items.reduce((sum, item) => {
        const product = productById.get(item.productId)!
        return sum + Number(product.pricePaisa) * item.quantity
      }, 0)
      if (!Number.isSafeInteger(subtotalPaisa)) throw new HttpError(422, 'INVALID_AMOUNT', 'Sale total exceeds the supported amount')
      const discountPaisa = toPaisa(input.discount)
      if (discountPaisa > Math.floor(subtotalPaisa * discountLimit)) {
        throw new HttpError(403, 'DISCOUNT_LIMIT', 'Discount exceeds the limit for your shop role')
      }
      if (discountPaisa > subtotalPaisa) throw new HttpError(422, 'INVALID_DISCOUNT', 'Discount cannot exceed the subtotal')
      const totalPaisa = subtotalPaisa - discountPaisa
      const paidPaisa = toPaisa(input.amountPaid)
      if (paidPaisa > totalPaisa) throw new HttpError(422, 'OVERPAYMENT', 'Amount paid cannot exceed the sale total')
      const balancePaisa = totalPaisa - paidPaisa
      if (input.paymentMethod !== 'credit' && balancePaisa > 0) throw new HttpError(422, 'PARTIAL_CASH_SALE', 'Cash and digital sales must be paid in full')
      if (input.paymentMethod === 'credit' && !input.customerId) throw new HttpError(422, 'CUSTOMER_REQUIRED', 'Credit sales require a customer')

      let customerName: string | undefined
      if (input.customerId) {
        const customer = await db.collection('customers').findOne({ _id: new ObjectId(input.customerId), shopId }, { session })
        if (!customer) throw new HttpError(422, 'CUSTOMER_NOT_FOUND', 'Customer does not belong to this shop')
        customerName = customer.name
      }
      const grossLines = input.items.map((item) => Number(productById.get(item.productId)!.pricePaisa) * item.quantity)
      const netLines = allocateDiscountPaisa(grossLines, discountPaisa)
      const saleItems = input.items.map((item, index) => {
        const product = productById.get(item.productId)!
        return {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          unitPricePaisa: Number(product.pricePaisa),
          costPaisa: Number(product.costPaisa),
          quantity: item.quantity,
          lineTotalPaisa: netLines[index],
        }
      })
      const now = new Date()
      for (const [productId, quantity] of quantities) {
        const result = await db.collection('products').updateOne(
          { _id: new ObjectId(productId), shopId, archived: false, stock: { $gte: quantity } },
          { $inc: { stock: -quantity }, $set: { updatedAt: now } },
          { session },
        )
        if (result.modifiedCount !== 1) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Stock changed or is insufficient for this sale')
        const product = productById.get(productId)!
        await db.collection('stockMovements').insertOne({
          shopId, productId: product._id, productName: product.name, type: 'sale', quantity: -quantity,
          reason: 'Sale', actorId, createdAt: now,
        }, { session })
      }
      const counter = await db.collection('counters').findOneAndUpdate(
        { shopId, name: 'receipt' },
        { $inc: { value: 1 }, $setOnInsert: { createdAt: now } },
        { upsert: true, returnDocument: 'after', session },
      )
      const receiptNumber = `DD-${String(counter?.value ?? 1).padStart(8, '0')}`
      const saleId = new ObjectId()
      const sale = {
        _id: saleId,
        shopId,
        receiptNumber,
        items: saleItems,
        subtotalPaisa,
        discountPaisa,
        totalPaisa,
        amountPaidPaisa: paidPaisa,
        balanceDuePaisa: balancePaisa,
        paymentMethod: input.paymentMethod,
        customerId: input.customerId ? new ObjectId(input.customerId) : undefined,
        customerName,
        status: 'completed',
        createdAt: now,
        createdBy: actorId,
        cashierId: actorId,
      }
      await db.collection('sales').insertOne(sale, { session })
      if (paidPaisa > 0) {
        await db.collection('payments').insertOne({
          shopId, customerId: input.customerId ? new ObjectId(input.customerId) : undefined, saleId,
          amountPaisa: paidPaisa, method: input.paymentMethod === 'credit' ? 'cash' : input.paymentMethod,
          type: 'sale', actorId, createdAt: now,
        }, { session })
      }
      if (balancePaisa > 0 && input.customerId) {
        await db.collection('customers').updateOne({ _id: new ObjectId(input.customerId), shopId }, { $inc: { ledgerVersion: 1 } }, { session })
        await db.collection('ledgerEntries').insertOne({
          shopId, customerId: new ObjectId(input.customerId), type: 'credit_sale', amountPaisa: balancePaisa,
          referenceId: saleId, note: `Credit sale ${receiptNumber}`, actorId, createdAt: now,
        }, { session })
      }
      const safeSale = serializeDocument(sale)
      await db.collection('idempotencyKeys').insertOne({
        shopId, key: idem.key, requestHash: idem.hash, response: safeSale, createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      }, { session })
      await db.collection('auditLogs').insertOne({
        shopId, actorId, action: 'sale.created', entity: 'sale', entityId: saleId,
        after: { receiptNumber, totalPaisa, itemCount: saleItems.length }, createdAt: now,
      }, { session })
      return safeSale
    }))
    sendData(response, responseBody, 201)
  }))

  router.post('/:saleId/returns', requireRole('owner', 'manager'), requireBusinessAccess(db), requireIdempotencyKey(), asyncRoute(async (request, response) => {
    const saleId = assertId(request.params.saleId, 'SALE_NOT_FOUND')
    const input = returnSchema.parse(request.body)
    const idem = keyFor(request)
    const shopId = request.tenant!.shopId
    const existing = await db.collection('idempotencyKeys').findOne({ shopId, key: idem.key })
    if (existing) {
      if (existing.requestHash !== idem.hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request')
      sendData(response, existing.response)
      return
    }
    const returned = await executeIdempotent(db, idem, () => inTransaction(db, async (session) => {
      const sale = await db.collection('sales').findOne({ _id: saleId, shopId }, { session })
      if (!sale || sale.status !== 'completed') throw new HttpError(404, 'SALE_NOT_RETURNABLE', 'Completed sale not found')
      const prior = await db.collection('returns').find({ shopId, saleId }, { session }).toArray()
      const alreadyReturned = new Map<string, number>()
      for (const record of prior) {
        for (const item of (record.items as Array<{ productId: ObjectId; quantity: number }>)) {
          const id = item.productId.toHexString()
          alreadyReturned.set(id, (alreadyReturned.get(id) ?? 0) + item.quantity)
        }
      }
      const originalItems = sale.items as Array<{ productId: ObjectId; name: string; sku: string; unit: string; unitPricePaisa: number; costPaisa: number; quantity: number; lineTotalPaisa: number }>
      const requests = input.items ?? originalItems.map((item) => ({ productId: item.productId.toHexString(), quantity: item.quantity - (alreadyReturned.get(item.productId.toHexString()) ?? 0) })).filter((item) => item.quantity > 0)
      if (!requests.length) throw new HttpError(409, 'ALREADY_RETURNED', 'No sale quantities remain available to return')
      const resultItems = requests.map((requested) => {
        const original = originalItems.find((item) => item.productId.toHexString() === requested.productId)
        if (!original) throw new HttpError(422, 'RETURN_ITEM_INVALID', 'Return item was not part of this sale')
        const remaining = original.quantity - (alreadyReturned.get(requested.productId) ?? 0)
        if (requested.quantity > remaining) throw new HttpError(422, 'RETURN_QUANTITY_EXCEEDED', 'Return quantity exceeds the quantity sold minus previous returns')
        return {
          productId: original.productId,
          name: original.name,
          quantity: requested.quantity,
          unitPricePaisa: original.unitPricePaisa,
          costPaisa: original.costPaisa,
          refundPaisa: returnLineAmountPaisa(
            original.lineTotalPaisa,
            alreadyReturned.get(requested.productId) ?? 0,
            requested.quantity,
            original.quantity,
          ),
        }
      })
      const refundPaisa = resultItems.reduce((sum, item) => sum + item.refundPaisa, 0)
      const now = new Date()
      const returnId = new ObjectId()
      let ledgerCreditPaisa = 0
      if (sale.customerId && refundPaisa > 0) {
        await db.collection('customers').updateOne({ _id: sale.customerId, shopId }, { $inc: { ledgerVersion: 1 } }, { session })
        if (input.refundMethod === 'credit') {
          ledgerCreditPaisa = refundPaisa
        } else {
          const ledger = await db.collection('ledgerEntries').find({ shopId, customerId: sale.customerId }, { session, projection: { amountPaisa: 1 } }).toArray()
          const outstandingPaisa = ledger.reduce((sum, entry) => sum + Number(entry.amountPaisa), 0)
          ledgerCreditPaisa = Math.min(Math.max(0, outstandingPaisa), refundPaisa)
        }
      }
      for (const item of resultItems) {
        await db.collection('products').updateOne({ _id: item.productId, shopId }, { $inc: { stock: item.quantity }, $set: { updatedAt: now } }, { session })
        await db.collection('stockMovements').insertOne({
          shopId, productId: item.productId, productName: item.name, type: 'return', quantity: item.quantity,
          reason: input.reason, referenceId: returnId, actorId: request.identity!.userId, createdAt: now,
        }, { session })
      }
      const fullyReturned = originalItems.every((item) =>
        (alreadyReturned.get(item.productId.toHexString()) ?? 0) + resultItems.filter((returnedItem) => returnedItem.productId.equals(item.productId)).reduce((sum, returnedItem) => sum + returnedItem.quantity, 0) >= item.quantity,
      )
      await db.collection('returns').insertOne({
        _id: returnId, shopId, saleId, items: resultItems, refundPaisa, refundMethod: input.refundMethod, reason: input.reason,
        ledgerCreditPaisa, actorId: request.identity!.userId, createdAt: now,
      }, { session })
      if (refundPaisa > 0) {
        await db.collection('payments').insertOne({
          shopId, customerId: sale.customerId, saleId, returnId, amountPaisa: refundPaisa,
          method: input.refundMethod, type: 'refund',
          actorId: request.identity!.userId, createdAt: now,
        }, { session })
      }
      if (sale.customerId && ledgerCreditPaisa > 0) {
        await db.collection('ledgerEntries').insertOne({
          shopId, customerId: sale.customerId, type: 'return', amountPaisa: -ledgerCreditPaisa, referenceId: returnId,
          note: `Return for ${sale.receiptNumber}`, actorId: request.identity!.userId, createdAt: now,
        }, { session })
      }
      if (fullyReturned) await db.collection('sales').updateOne({ _id: saleId, shopId }, { $set: { status: 'returned', returnedAt: now } }, { session })
      const result = serializeDocument({ id: returnId, saleId, refundPaisa, items: resultItems })
      await db.collection('idempotencyKeys').insertOne({
        shopId, key: idem.key, requestHash: idem.hash, response: result, createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      }, { session })
      await db.collection('auditLogs').insertOne({
        shopId, actorId: request.identity!.userId, action: 'sale.returned', entity: 'sale', entityId: saleId,
        after: { returnId, refundPaisa, reason: input.reason, fullyReturned }, createdAt: now,
      }, { session })
      return result
    }))
    sendData(response, returned, 201)
  }))

  return router
}
