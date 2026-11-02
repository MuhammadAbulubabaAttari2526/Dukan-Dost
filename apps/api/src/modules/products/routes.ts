import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { z } from 'zod'
import { requireBusinessAccess, requireRole, requireTenant } from '../../middleware/auth.js'
import { requireAuth } from '../../middleware/auth.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'
import { toPaisa } from '../../utils/money.js'
import { serializeDocument } from '../../utils/serialization.js'
import { inTransaction } from '../../utils/transaction.js'

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(30),
  cost: z.number().finite().nonnegative().max(100_000_000),
  price: z.number().finite().nonnegative().max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  supplierId: z.string().optional(),
}).strict()
const importSchema = z.object({ rows: z.array(productSchema).min(1).max(100) }).strict()
const adjustSchema = z.object({ quantity: z.number().int().min(-1_000_000).max(1_000_000), reason: z.string().trim().min(2).max(300) }).strict()
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50), search: z.string().max(100).optional(), archived: z.enum(['true', 'false']).optional() }).strict()

function assertId(id: string | string[] | undefined): ObjectId {
  const value = Array.isArray(id) ? id[0] : id
  if (!value || !ObjectId.isValid(value)) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  return new ObjectId(value)
}

export function productRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  router.use(requireAuth(db), requireTenant(db))

  router.get('/', asyncRoute(async (request, response) => {
    const { page, limit, search, archived } = listSchema.parse(request.query)
    const filter: Record<string, unknown> = { shopId: request.tenant!.shopId }
    if (archived !== undefined) filter.archived = archived === 'true'
    else filter.archived = false
    if (search) filter.$or = [
      { name: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
      { skuLower: { $regex: `^${search.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
    ]
    const [products, total] = await Promise.all([
      db.collection('products').find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
      db.collection('products').countDocuments(filter),
    ])
    const cashier = request.tenant!.role === 'cashier'
    const data = products.map((product) => {
      const serialized = serializeDocument(product) as Record<string, unknown>
      if (cashier) {
        delete serialized.cost
        delete serialized.supplierId
      }
      return serialized
    })
    response.json({ data, meta: { page, limit, total, nextCursor: page * limit < total ? String(page + 1) : null } })
  }))

  router.post('/', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const input = productSchema.parse(request.body)
    const shopId = request.tenant!.shopId
    const userId = request.identity!.userId
    const productId = new ObjectId()
    const now = new Date()
    const skuLower = input.sku.toLowerCase()
    if (input.supplierId && !ObjectId.isValid(input.supplierId)) throw new HttpError(422, 'INVALID_SUPPLIER', 'Supplier identifier is invalid')
    await inTransaction(db, async (session) => {
      if (input.supplierId) {
        const supplier = await db.collection('suppliers').findOne({ _id: new ObjectId(input.supplierId), shopId }, { session })
        if (!supplier) throw new HttpError(422, 'INVALID_SUPPLIER', 'Supplier does not belong to this shop')
      }
      await db.collection('products').insertOne({
        _id: productId,
        shopId,
        name: input.name,
        sku: input.sku,
        skuLower,
        category: input.category,
        unit: input.unit,
        costPaisa: toPaisa(input.cost),
        pricePaisa: toPaisa(input.price),
        stock: input.stock,
        lowStockThreshold: input.lowStockThreshold,
        supplierId: input.supplierId ? new ObjectId(input.supplierId) : undefined,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }, { session })
      if (input.stock > 0) {
        await db.collection('stockMovements').insertOne({
          shopId, productId, productName: input.name, type: 'opening', quantity: input.stock, reason: 'Opening stock', actorId: userId, createdAt: now,
        }, { session })
      }
      await db.collection('auditLogs').insertOne({
        shopId, actorId: userId, action: 'product.created', entity: 'product', entityId: productId, after: { name: input.name, sku: input.sku }, createdAt: now,
      }, { session })
    })
    const product = await db.collection('products').findOne({ _id: productId, shopId })
    sendData(response, product ? serializeDocument(product) : null, 201)
  }))

  router.post('/import', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const { rows } = importSchema.parse(request.body)
    const shopId = request.tenant!.shopId
    const skuKeys = rows.map((row) => row.sku.toLowerCase())
    if (new Set(skuKeys).size !== skuKeys.length) throw new HttpError(422, 'DUPLICATE_IMPORT_SKU', 'The import contains duplicate SKUs')
    const existing = await db.collection('products').find({ shopId, skuLower: { $in: skuKeys } }, { projection: { sku: 1 } }).toArray()
    if (existing.length) throw new HttpError(409, 'DUPLICATE_SKU', 'One or more SKUs already exist in this shop', { skus: existing.map((product) => product.sku) })
    for (const row of rows) {
      if (row.supplierId && !ObjectId.isValid(row.supplierId)) throw new HttpError(422, 'INVALID_SUPPLIER', 'A supplier identifier is invalid')
      if (row.supplierId && !(await db.collection('suppliers').findOne({ _id: new ObjectId(row.supplierId), shopId }))) {
        throw new HttpError(422, 'INVALID_SUPPLIER', 'A supplier does not belong to this shop')
      }
    }

    const now = new Date()
    const products = rows.map((row) => ({
      _id: new ObjectId(),
      shopId,
      name: row.name,
      sku: row.sku,
      skuLower: row.sku.toLowerCase(),
      category: row.category,
      unit: row.unit,
      costPaisa: toPaisa(row.cost),
      pricePaisa: toPaisa(row.price),
      stock: row.stock,
      lowStockThreshold: row.lowStockThreshold,
      supplierId: row.supplierId ? new ObjectId(row.supplierId) : undefined,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }))
    await inTransaction(db, async (session) => {
      await db.collection('products').insertMany(products, { session })
      const movements = products.filter((product) => product.stock > 0).map((product) => ({
        shopId, productId: product._id, productName: product.name, type: 'opening', quantity: product.stock,
        reason: 'Opening stock from product import', actorId: request.identity!.userId, createdAt: now,
      }))
      if (movements.length) await db.collection('stockMovements').insertMany(movements, { session })
      await db.collection('auditLogs').insertOne({
        shopId, actorId: request.identity!.userId, action: 'product.imported', entity: 'product',
        after: { count: products.length }, createdAt: now,
      }, { session })
    })
    sendData(response, { imported: products.length, products: products.map(serializeDocument) }, 201)
  }))

  router.patch('/:productId', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const productId = assertId(request.params.productId)
    const input = productSchema.partial().omit({ stock: true }).strict().parse(request.body)
    if (Object.keys(input).length === 0) throw new HttpError(422, 'EMPTY_UPDATE', 'Provide product changes')
    const shopId = request.tenant!.shopId
    const old = await db.collection('products').findOne({ _id: productId, shopId })
    if (!old) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
    const changes: Record<string, unknown> = { ...input, updatedAt: new Date() }
    if (input.sku !== undefined) changes.skuLower = input.sku.toLowerCase()
    if (input.cost !== undefined) {
      changes.costPaisa = toPaisa(input.cost)
      delete changes.cost
    }
    if (input.price !== undefined) {
      changes.pricePaisa = toPaisa(input.price)
      delete changes.price
    }
    if (input.supplierId !== undefined) {
      if (input.supplierId && !ObjectId.isValid(input.supplierId)) throw new HttpError(422, 'INVALID_SUPPLIER', 'Supplier identifier is invalid')
      if (input.supplierId && !(await db.collection('suppliers').findOne({ _id: new ObjectId(input.supplierId), shopId }))) {
        throw new HttpError(422, 'INVALID_SUPPLIER', 'Supplier does not belong to this shop')
      }
      changes.supplierId = input.supplierId ? new ObjectId(input.supplierId) : null
    }
    await db.collection('products').updateOne({ _id: productId, shopId }, { $set: changes })
    const updated = await db.collection('products').findOne({ _id: productId, shopId })
    await db.collection('auditLogs').insertOne({
      shopId, actorId: request.identity!.userId, action: 'product.updated', entity: 'product', entityId: productId,
      before: { name: old.name, sku: old.sku, pricePaisa: old.pricePaisa, costPaisa: old.costPaisa },
      after: changes, createdAt: new Date(),
    })
    sendData(response, updated ? serializeDocument(updated) : null)
  }))

  router.post('/:productId/adjustments', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const productId = assertId(request.params.productId)
    const input = adjustSchema.parse(request.body)
    const shopId = request.tenant!.shopId
    const movementId = new ObjectId()
    const now = new Date()
    await inTransaction(db, async (session) => {
      const result = await db.collection('products').findOneAndUpdate(
        { _id: productId, shopId, stock: { $gte: Math.max(0, -input.quantity) } },
        { $inc: { stock: input.quantity }, $set: { updatedAt: now } },
        { returnDocument: 'after', session },
      )
      if (!result) {
        const exists = await db.collection('products').findOne({ _id: productId, shopId }, { session, projection: { _id: 1 } })
        if (!exists) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
        throw new HttpError(422, 'INSUFFICIENT_STOCK', 'Stock cannot become negative')
      }
      await db.collection('stockMovements').insertOne({
        _id: movementId, shopId, productId, productName: result.name, type: 'adjustment', quantity: input.quantity, reason: input.reason,
        actorId: request.identity!.userId, createdAt: now,
      }, { session })
      await db.collection('auditLogs').insertOne({
        shopId, actorId: request.identity!.userId, action: 'stock.adjusted', entity: 'product', entityId: productId,
        before: { stock: result.stock - input.quantity }, after: { stock: result.stock, reason: input.reason }, createdAt: now,
      }, { session })
    })
    sendData(response, { movementId: movementId.toHexString() }, 201)
  }))

  router.post('/:productId/archive', requireRole('owner', 'manager'), requireBusinessAccess(db), asyncRoute(async (request, response) => {
    const productId = assertId(request.params.productId)
    const shopId = request.tenant!.shopId
    const result = await db.collection('products').updateOne({ _id: productId, shopId }, { $set: { archived: true, updatedAt: new Date() } })
    if (result.matchedCount === 0) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
    await db.collection('auditLogs').insertOne({ shopId, actorId: request.identity!.userId, action: 'product.archived', entity: 'product', entityId: productId, createdAt: new Date() })
    sendData(response, { archived: true })
  }))

  router.get('/:productId/movements', requireRole('owner', 'manager'), asyncRoute(async (request, response) => {
    const productId = assertId(request.params.productId)
    const page = z.coerce.number().int().min(1).default(1).parse(request.query.page)
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(request.query.limit)
    const movements = await db.collection('stockMovements').find({ shopId: request.tenant!.shopId, productId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray()
    sendData(response, movements.map(serializeDocument))
  }))

  return router
}
