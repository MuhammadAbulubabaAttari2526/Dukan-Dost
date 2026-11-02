import { Router } from 'express'
import { ObjectId, type ClientSession, type Db } from 'mongodb'
import { z } from 'zod'
import { requireBusinessAccess, requireRole, requireTenant } from '../../middleware/auth.js'
import { requireAuth } from '../../middleware/auth.js'
import { executeIdempotent, requireIdempotencyKey } from '../../middleware/idempotency.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'
import { toPaisa } from '../../utils/money.js'
import { serializeDocument } from '../../utils/serialization.js'
import { inTransaction } from '../../utils/transaction.js'

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()
const customerSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional() }).strict()
const supplierSchema = z.object({ name: z.string().trim().min(2).max(120), contact: z.string().trim().max(120), phone: z.string().trim().max(40) }).strict()
const expenseSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.string().trim().min(1).max(100),
  amount: z.number().finite().positive(),
  date: z.string().date(),
  paymentMethod: z.enum(['cash', 'digital']),
  note: z.string().trim().max(500).optional(),
}).strict()
const purchaseSchema = z.object({
  supplierId: z.string().regex(/^[a-f\d]{24}$/i),
  invoiceNumber: z.string().trim().min(2).max(100),
  items: z.array(z.object({
    productId: z.string().regex(/^[a-f\d]{24}$/i),
    quantity: z.number().int().positive().max(100_000),
    unitCost: z.number().finite().nonnegative().max(100_000_000),
  }).strict()).min(1).max(200),
}).strict()
const paymentSchema = z.object({ amount: z.number().finite().positive(), method: z.enum(['cash', 'digital']) }).strict()

function assertId(id: string | string[] | undefined, code: string): ObjectId {
  const value = Array.isArray(id) ? id[0] : id
  if (!value || !ObjectId.isValid(value)) throw new HttpError(404, code, 'Record not found')
  return new ObjectId(value)
}

async function setIdempotencyResponse(db: Db, shopId: ObjectId, key: string, hash: string, result: unknown, session: ClientSession): Promise<void> {
  await db.collection('idempotencyKeys').insertOne({
    shopId,
    key,
    requestHash: hash,
    response: result,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
  }, { session })
}

export function operationsRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  router.use(requireAuth(db), requireTenant(db))

  router.get('/customers', asyncRoute(async (request, response) => {
    const { page, limit } = pageSchema.parse(request.query)
    const shopId = request.tenant!.shopId
    const customers = await db.collection('customers').find({ shopId }).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).toArray()
    const cashier = request.tenant!.role === 'cashier'
    sendData(response, customers.map((customer) => {
      const serialized = serializeDocument(customer) as Record<string, unknown>
      if (cashier) {
        delete serialized.email
        delete serialized.address
      }
      return serialized
    }))
  }))

  router.post('/customers', requireRole('owner', 'manager', 'cashier'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const input = customerSchema.parse(request.body)
    const customer = { _id: new ObjectId(), shopId: request.tenant!.shopId, ...input, createdAt: new Date(), createdBy: request.identity!.userId }
    await db.collection('customers').insertOne(customer)
    await db.collection('auditLogs').insertOne({
      shopId: request.tenant!.shopId, actorId: request.identity!.userId, action: 'customer.created', entity: 'customer',
      entityId: customer._id, createdAt: new Date(),
    })
    sendData(response, serializeDocument(customer), 201)
  }))

  router.get('/customers/:customerId/ledger', requireRole('owner', 'manager'), asyncRoute(async (request, response) => {
    const customerId = assertId(request.params.customerId, 'CUSTOMER_NOT_FOUND')
    const { page, limit } = pageSchema.parse(request.query)
    const entries = await db.collection('ledgerEntries').find({ shopId: request.tenant!.shopId, customerId }).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).toArray()
    let balancePaisa = 0
    const rows = entries.map((entry) => {
      balancePaisa += Number(entry.amountPaisa)
      return { ...(serializeDocument(entry) as Record<string, unknown>), runningBalance: balancePaisa / 100 }
    })
    sendData(response, rows)
  }))

  router.post('/customers/:customerId/payments', requireRole('owner', 'manager'), requireBusinessAccess(db), requireIdempotencyKey(), asyncRoute(async (request, response) => {
    const input = paymentSchema.parse(request.body)
    const customerId = assertId(request.params.customerId, 'CUSTOMER_NOT_FOUND')
    const idempotency = request.idempotency!
    const existing = await db.collection('idempotencyKeys').findOne({ shopId: idempotency.shopId, key: idempotency.key })
    if (existing) {
      if (existing.requestHash !== idempotency.hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request')
      sendData(response, existing.response)
      return
    }
    const payment = await executeIdempotent(db, idempotency, () => inTransaction(db, async (session) => {
      const customer = await db.collection('customers').findOne({ _id: customerId, shopId: idempotency.shopId }, { session })
      if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found')
      const entries = await db.collection('ledgerEntries').find({ shopId: idempotency.shopId, customerId }, { session, projection: { amountPaisa: 1 } }).toArray()
      const balancePaisa = entries.reduce((sum, entry) => sum + Number(entry.amountPaisa), 0)
      const amountPaisa = toPaisa(input.amount)
      if (balancePaisa <= 0) throw new HttpError(422, 'NO_OUTSTANDING_BALANCE', 'Customer has no outstanding balance')
      if (amountPaisa > balancePaisa) throw new HttpError(422, 'OVERPAYMENT', 'Payment exceeds the outstanding customer balance')
      const now = new Date()
      const paymentId = new ObjectId()
      const ledgerId = new ObjectId()
      const lock = await db.collection('customers').updateOne(
        { _id: customerId, shopId: idempotency.shopId },
        { $inc: { ledgerVersion: 1 } },
        { session },
      )
      if (lock.matchedCount !== 1) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found')
      const paymentDoc = {
        _id: paymentId, shopId: idempotency.shopId, customerId, amountPaisa, method: input.method,
        type: 'credit_payment', idempotencyKey: idempotency.key, actorId: request.identity!.userId, createdAt: now,
      }
      await db.collection('payments').insertOne(paymentDoc, { session })
      await db.collection('ledgerEntries').insertOne({
        _id: ledgerId, shopId: idempotency.shopId, customerId, type: 'payment', amountPaisa: -amountPaisa,
        referenceId: paymentId, note: 'Customer payment', actorId: request.identity!.userId, createdAt: now,
      }, { session })
      const result = serializeDocument(paymentDoc)
      await setIdempotencyResponse(db, idempotency.shopId, idempotency.key, idempotency.hash, result, session)
      await db.collection('auditLogs').insertOne({
        shopId: idempotency.shopId, actorId: request.identity!.userId, action: 'customer.payment_received', entity: 'customer',
        entityId: customerId, after: { amountPaisa, paymentId }, createdAt: now,
      }, { session })
      return result
    }))
    sendData(response, payment, 201)
  }))

  router.get('/suppliers', requireRole('owner', 'manager'), asyncRoute(async (request, response) => {
    const { page, limit } = pageSchema.parse(request.query)
    const suppliers = await db.collection('suppliers').find({ shopId: request.tenant!.shopId }).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).toArray()
    sendData(response, suppliers.map(serializeDocument))
  }))

  router.post('/suppliers', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const input = supplierSchema.parse(request.body)
    const supplier = { _id: new ObjectId(), shopId: request.tenant!.shopId, ...input, createdAt: new Date() }
    await db.collection('suppliers').insertOne(supplier)
    await db.collection('auditLogs').insertOne({ shopId: request.tenant!.shopId, actorId: request.identity!.userId, action: 'supplier.created', entity: 'supplier', entityId: supplier._id, createdAt: new Date() })
    sendData(response, serializeDocument(supplier), 201)
  }))

  router.get('/suppliers/:supplierId/ledger', requireRole('owner', 'manager'), asyncRoute(async (request, response) => {
    const supplierId = assertId(request.params.supplierId, 'SUPPLIER_NOT_FOUND')
    const { page, limit } = pageSchema.parse(request.query)
    const entries = await db.collection('supplierLedger').find({ shopId: request.tenant!.shopId, supplierId }).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).toArray()
    sendData(response, entries.map(serializeDocument))
  }))

  router.post('/purchases', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const input = purchaseSchema.parse(request.body)
    const shopId = request.tenant!.shopId
    const supplierId = new ObjectId(input.supplierId)
    const supplier = await db.collection('suppliers').findOne({ _id: supplierId, shopId })
    if (!supplier) throw new HttpError(422, 'SUPPLIER_NOT_FOUND', 'Supplier does not belong to this shop')
    const productIds = [...new Set(input.items.map((item) => item.productId))].map((id) => new ObjectId(id))
    const products = await db.collection('products').find({ _id: { $in: productIds }, shopId, archived: false }).toArray()
    if (products.length !== productIds.length) throw new HttpError(422, 'PRODUCT_UNAVAILABLE', 'A purchase item is no longer available')
    const productById = new Map(products.map((product) => [product._id.toHexString(), product]))
    const items = input.items.map((item) => ({
      productId: new ObjectId(item.productId),
      name: productById.get(item.productId)!.name,
      quantity: item.quantity,
      unitCostPaisa: toPaisa(item.unitCost),
    }))
    const totalPaisa = items.reduce((sum, item) => sum + item.unitCostPaisa * item.quantity, 0)
    const purchase = {
      _id: new ObjectId(), shopId, supplierId, supplierName: supplier.name, invoiceNumber: input.invoiceNumber,
      items, totalPaisa, amountPaidPaisa: 0, status: 'draft', paymentStatus: 'unpaid', createdAt: new Date(),
      createdBy: request.identity!.userId,
    }
    await db.collection('purchases').insertOne(purchase)
    await db.collection('auditLogs').insertOne({ shopId, actorId: request.identity!.userId, action: 'purchase.created', entity: 'purchase', entityId: purchase._id, after: { invoiceNumber: purchase.invoiceNumber, totalPaisa }, createdAt: new Date() })
    sendData(response, serializeDocument(purchase), 201)
  }))

  router.post('/purchases/:purchaseId/confirm', requireRole('owner', 'manager'), requireBusinessAccess(db), requireIdempotencyKey(), asyncRoute(async (request, response) => {
    const purchaseId = assertId(request.params.purchaseId, 'PURCHASE_NOT_FOUND')
    const idem = request.idempotency!
    const existingKey = await db.collection('idempotencyKeys').findOne({ shopId: idem.shopId, key: idem.key })
    if (existingKey) {
      if (existingKey.requestHash !== idem.hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request')
      sendData(response, existingKey.response)
      return
    }
    const result = await executeIdempotent(db, idem, () => inTransaction(db, async (session) => {
      const purchase = await db.collection('purchases').findOne({ _id: purchaseId, shopId: idem.shopId }, { session })
      if (!purchase) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found')
      if (purchase.status !== 'draft') throw new HttpError(409, 'PURCHASE_ALREADY_CONFIRMED', 'Purchase stock-in has already been processed')
      const now = new Date()
      const items = purchase.items as Array<{ productId: ObjectId; name: string; quantity: number; unitCostPaisa: number }>
      for (const item of items) {
        const product = await db.collection('products').findOne({ _id: item.productId, shopId: idem.shopId, archived: false }, { session })
        if (!product) throw new HttpError(422, 'PRODUCT_UNAVAILABLE', `Product ${item.name} is no longer available`)
        const oldQty = Number(product.stock)
        const newQty = oldQty + item.quantity
        if (!Number.isSafeInteger(newQty) || newQty > 1_000_000) throw new HttpError(422, 'STOCK_LIMIT', `Purchase would exceed the stock limit for ${item.name}`)
        const weightedCost = newQty === 0 ? item.unitCostPaisa : Number(
          (BigInt(Number(product.costPaisa)) * BigInt(oldQty) + BigInt(item.unitCostPaisa) * BigInt(item.quantity) + BigInt(newQty) / 2n)
          / BigInt(newQty),
        )
        await db.collection('products').updateOne({ _id: item.productId, shopId: idem.shopId }, {
          $inc: { stock: item.quantity }, $set: { costPaisa: weightedCost, updatedAt: now },
        }, { session })
        await db.collection('stockMovements').insertOne({
          shopId: idem.shopId, productId: item.productId, productName: item.name, type: 'purchase', quantity: item.quantity,
          reason: `Purchase ${purchase.invoiceNumber}`, referenceId: purchaseId, actorId: request.identity!.userId, createdAt: now,
        }, { session })
      }
      const purchaseUpdate = await db.collection('purchases').updateOne({ _id: purchaseId, shopId: idem.shopId, status: 'draft' }, {
        $set: { status: 'confirmed', confirmedAt: now },
      }, { session })
      if (purchaseUpdate.modifiedCount !== 1) throw new HttpError(409, 'PURCHASE_ALREADY_CONFIRMED', 'Purchase stock-in has already been processed')
      await db.collection('supplierLedger').insertOne({
        shopId: idem.shopId, supplierId: purchase.supplierId, type: 'purchase', amountPaisa: Number(purchase.totalPaisa),
        referenceId: purchaseId, note: `Purchase ${purchase.invoiceNumber}`, actorId: request.identity!.userId, createdAt: now,
      }, { session })
      const responseBody = serializeDocument({ id: purchaseId, status: 'confirmed' })
      await setIdempotencyResponse(db, idem.shopId, idem.key, idem.hash, responseBody, session)
      await db.collection('auditLogs').insertOne({ shopId: idem.shopId, actorId: request.identity!.userId, action: 'purchase.confirmed', entity: 'purchase', entityId: purchaseId, createdAt: now }, { session })
      return responseBody
    }))
    sendData(response, result)
  }))

  router.post('/purchases/:purchaseId/payments', requireRole('owner', 'manager'), requireBusinessAccess(db), requireIdempotencyKey(), asyncRoute(async (request, response) => {
    const purchaseId = assertId(request.params.purchaseId, 'PURCHASE_NOT_FOUND')
    const input = paymentSchema.parse(request.body)
    const idem = request.idempotency!
    const duplicate = await db.collection('idempotencyKeys').findOne({ shopId: idem.shopId, key: idem.key })
    if (duplicate) {
      if (duplicate.requestHash !== idem.hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request')
      sendData(response, duplicate.response)
      return
    }
    const result = await executeIdempotent(db, idem, () => inTransaction(db, async (session) => {
      const purchase = await db.collection('purchases').findOne({ _id: purchaseId, shopId: idem.shopId, status: 'confirmed' }, { session })
      if (!purchase) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'Confirmed purchase not found')
      const outstanding = Number(purchase.totalPaisa) - Number(purchase.amountPaidPaisa ?? 0)
      const amountPaisa = toPaisa(input.amount)
      if (amountPaisa > outstanding) throw new HttpError(422, 'OVERPAYMENT', 'Payment exceeds the supplier balance')
      const now = new Date()
      const paymentId = new ObjectId()
      const amountPaidPaisa = Number(purchase.amountPaidPaisa ?? 0) + amountPaisa
      const paymentStatus = amountPaidPaisa === Number(purchase.totalPaisa) ? 'paid' : 'partial'
      await db.collection('purchases').updateOne({ _id: purchaseId, shopId: idem.shopId }, { $set: { amountPaidPaisa, paymentStatus } }, { session })
      await db.collection('payments').insertOne({
        _id: paymentId, shopId: idem.shopId, supplierId: purchase.supplierId, purchaseId, amountPaisa, method: input.method,
        type: 'supplier_payment', idempotencyKey: idem.key, actorId: request.identity!.userId, createdAt: now,
      }, { session })
      await db.collection('supplierLedger').insertOne({
        shopId: idem.shopId, supplierId: purchase.supplierId, type: 'payment', amountPaisa: -amountPaisa,
        referenceId: paymentId, note: `Payment for ${purchase.invoiceNumber}`, actorId: request.identity!.userId, createdAt: now,
      }, { session })
      const responseBody = serializeDocument({ id: paymentId, amountPaisa, paymentStatus })
      await setIdempotencyResponse(db, idem.shopId, idem.key, idem.hash, responseBody, session)
      await db.collection('auditLogs').insertOne({ shopId: idem.shopId, actorId: request.identity!.userId, action: 'supplier.payment_made', entity: 'purchase', entityId: purchaseId, after: { amountPaisa, paymentStatus }, createdAt: now }, { session })
      return responseBody
    }))
    sendData(response, result, 201)
  }))

  router.post('/expenses', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const input = expenseSchema.parse(request.body)
    const expense = {
      _id: new ObjectId(), shopId: request.tenant!.shopId, ...input, amountPaisa: toPaisa(input.amount),
      actorId: request.identity!.userId, createdAt: new Date(),
    }
    delete (expense as Record<string, unknown>).amount
    await db.collection('expenses').insertOne(expense)
    await db.collection('auditLogs').insertOne({ shopId: expense.shopId, actorId: request.identity!.userId, action: 'expense.recorded', entity: 'expense', entityId: expense._id, after: { title: input.title, amountPaisa: expense.amountPaisa }, createdAt: new Date() })
    sendData(response, serializeDocument(expense), 201)
  }))

  return router
}
