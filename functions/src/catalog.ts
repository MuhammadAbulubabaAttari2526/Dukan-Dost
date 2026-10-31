import { FieldValue } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db, enforceRateLimit, parse, requireShopRole, requireUid, requireWritableShop, safeError } from './helpers.js'
import { productSchema } from './validation.js'

const options = { region: 'asia-south1', maxInstances: 10 } as const
const base = z.object({ shopId: z.string().min(3) })

export const saveProduct = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ id: z.string().optional(), input: productSchema }), request.data)
  await enforceRateLimit(uid, 'saveProduct')
  await requireShopRole(uid, input.shopId, ['owner', 'manager'])
  await requireWritableShop(input.shopId)
  try {
    await db.runTransaction(async (transaction) => {
      const products = db.collection(`shops/${input.shopId}/products`)
      const duplicate = await transaction.get(products.where('sku', '==', input.input.sku).limit(1))
      if (duplicate.docs.some((document) => document.id !== input.id)) throw new Error('This SKU already exists')
      const ref = input.id ? products.doc(input.id) : products.doc()
      const existing = input.id ? await transaction.get(ref) : null
      if (input.id && !existing?.exists) throw new Error('Product not found')
      const now = FieldValue.serverTimestamp()
      const stock = existing?.data()?.stock ?? input.input.stock
      transaction.set(ref, { ...input.input, stock, archived: existing?.data()?.archived ?? false, createdAt: existing?.data()?.createdAt ?? now, updatedAt: now }, { merge: Boolean(input.id) })
      if (!input.id && input.input.stock > 0) transaction.create(db.collection(`shops/${input.shopId}/stockMovements`).doc(), { productId: ref.id, productName: input.input.name, type: 'opening', quantity: input.input.stock, reason: 'Opening stock', createdAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: input.id ? 'product.updated' : 'product.created', actor: uid, detail: `${input.id ? 'Updated' : 'Created'} ${input.input.name}`, createdAt: now })
    })
  } catch (error) { safeError(error) }
  return { ok: true }
})

export const importProducts = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ rows: z.array(productSchema).min(1).max(100) }), request.data)
  await enforceRateLimit(uid, 'importProducts', 20)
  await requireShopRole(uid, input.shopId, ['owner', 'manager'])
  await requireWritableShop(input.shopId)
  const existing = await db.collection(`shops/${input.shopId}/products`).get()
  const skus = new Set(existing.docs.map((document) => String(document.data().sku).toLowerCase()))
  for (const row of input.rows) {
    const sku = row.sku.toLowerCase()
    if (skus.has(sku)) throw new Error(`Duplicate SKU: ${row.sku}`)
    skus.add(sku)
  }
  const batch = db.batch()
  const now = FieldValue.serverTimestamp()
  input.rows.forEach((row) => {
    const ref = db.collection(`shops/${input.shopId}/products`).doc()
    batch.create(ref, { ...row, archived: false, createdAt: now, updatedAt: now })
    if (row.stock > 0) batch.create(db.collection(`shops/${input.shopId}/stockMovements`).doc(), { productId: ref.id, productName: row.name, type: 'opening', quantity: row.stock, reason: 'CSV opening stock', createdAt: now })
  })
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'product.csv_imported', actor: uid, detail: `${input.rows.length} products imported`, createdAt: now })
  await batch.commit()
  return { imported: input.rows.length }
})

export const archiveProduct = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ id: z.string().min(1) }), request.data)
  await requireShopRole(uid, input.shopId, ['owner', 'manager'])
  await requireWritableShop(input.shopId)
  const batch = db.batch()
  batch.update(db.doc(`shops/${input.shopId}/products/${input.id}`), { archived: true, updatedAt: FieldValue.serverTimestamp() })
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'product.archived', actor: uid, detail: `Product ${input.id} archived`, createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { ok: true }
})

export const adjustStock = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ id: z.string().min(1), quantity: z.number().int().min(-1_000_000).max(1_000_000), reason: z.string().trim().min(3).max(240) }), request.data)
  if (input.quantity === 0) throw new Error('Quantity cannot be zero')
  await enforceRateLimit(uid, 'adjustStock')
  await requireShopRole(uid, input.shopId, ['owner', 'manager'])
  await requireWritableShop(input.shopId)
  try {
    await db.runTransaction(async (transaction) => {
      const ref = db.doc(`shops/${input.shopId}/products/${input.id}`)
      const snapshot = await transaction.get(ref)
      const product = snapshot.data()
      if (!product) throw new Error('Product not found')
      if (product.stock + input.quantity < 0) throw new Error('Stock cannot become negative')
      const now = FieldValue.serverTimestamp()
      transaction.update(ref, { stock: product.stock + input.quantity, updatedAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/stockMovements`).doc(), { productId: ref.id, productName: product.name, type: 'adjustment', quantity: input.quantity, reason: input.reason, createdAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'stock.adjusted', actor: uid, detail: `${product.name}: ${input.quantity} — ${input.reason}`, createdAt: now })
    })
  } catch (error) { safeError(error) }
  return { ok: true }
})
