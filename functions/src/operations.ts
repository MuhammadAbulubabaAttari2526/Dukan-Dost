import { FieldValue } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db, enforceRateLimit, parse, requireShopRole, requireUid, requireWritableShop, safeError } from './helpers.js'
import { customerSchema, expenseSchema, purchaseSchema, supplierSchema } from './validation.js'

const options = { region: 'asia-south1', maxInstances: 10 } as const
const base = z.object({ shopId: z.string().min(3) })
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

async function authorize(uid: string, shopId: string, action: string) {
  await enforceRateLimit(uid, action)
  await requireShopRole(uid, shopId, ['owner', 'manager'])
  await requireWritableShop(shopId)
}

export const addCustomer = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ input: customerSchema }), request.data)
  await authorize(uid, input.shopId, 'addCustomer')
  const batch = db.batch()
  const ref = db.collection(`shops/${input.shopId}/customers`).doc()
  batch.create(ref, { ...input.input, createdAt: FieldValue.serverTimestamp() })
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'customer.created', actor: uid, detail: `Customer ${input.input.name} added`, createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { id: ref.id }
})

export const addSupplier = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ input: supplierSchema }), request.data)
  await authorize(uid, input.shopId, 'addSupplier')
  const ref = db.collection(`shops/${input.shopId}/suppliers`).doc()
  await ref.create({ ...input.input, createdAt: FieldValue.serverTimestamp() })
  return { id: ref.id }
})

export const addExpense = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ input: expenseSchema }), request.data)
  await authorize(uid, input.shopId, 'addExpense')
  const batch = db.batch()
  const ref = db.collection(`shops/${input.shopId}/expenses`).doc()
  batch.create(ref, { ...input.input, createdAt: FieldValue.serverTimestamp() })
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'expense.recorded', actor: uid, detail: `${input.input.title} — PKR ${input.input.amount}`, createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { id: ref.id }
})

export const createPurchase = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ input: purchaseSchema }), request.data)
  await authorize(uid, input.shopId, 'createPurchase')
  try {
    return await db.runTransaction(async (transaction) => {
      const supplier = await transaction.get(db.doc(`shops/${input.shopId}/suppliers/${input.input.supplierId}`))
      if (!supplier.exists) throw new Error('Supplier not found')
      const duplicate = await transaction.get(db.collection(`shops/${input.shopId}/purchases`).where('supplierId', '==', input.input.supplierId).where('invoiceNumber', '==', input.input.invoiceNumber).limit(1))
      if (!duplicate.empty) throw new Error('This supplier invoice already exists')
      const productDocs = await Promise.all(input.input.items.map((item) => transaction.get(db.doc(`shops/${input.shopId}/products/${item.productId}`))))
      if (productDocs.some((document) => !document.exists)) throw new Error('A purchased product does not exist')
      const items = input.input.items.map((item, index) => ({ ...item, name: productDocs[index].data()?.name }))
      const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0))
      const ref = db.collection(`shops/${input.shopId}/purchases`).doc()
      transaction.create(ref, { supplierId: input.input.supplierId, supplierName: supplier.data()?.name, invoiceNumber: input.input.invoiceNumber, items, total, status: 'draft', paymentStatus: 'unpaid', createdAt: FieldValue.serverTimestamp() })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'purchase.draft_created', actor: uid, detail: `Draft ${input.input.invoiceNumber} created`, createdAt: FieldValue.serverTimestamp() })
      return { id: ref.id, total }
    })
  } catch (error) { safeError(error) }
})

export const confirmPurchase = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(base.extend({ id: z.string().min(1) }), request.data)
  await authorize(uid, input.shopId, 'confirmPurchase')
  try {
    await db.runTransaction(async (transaction) => {
      const ref = db.doc(`shops/${input.shopId}/purchases/${input.id}`)
      const snapshot = await transaction.get(ref)
      const purchase = snapshot.data()
      if (!purchase || purchase.status !== 'draft') throw new Error('Purchase is already confirmed or unavailable')
      const productDocs = await Promise.all(purchase.items.map((item: { productId: string }) => transaction.get(db.doc(`shops/${input.shopId}/products/${item.productId}`))))
      const now = FieldValue.serverTimestamp()
      purchase.items.forEach((item: { productId: string; name: string; quantity: number; unitCost: number }) => {
        const product = productDocs.find((document) => document.id === item.productId)
        if (!product?.exists) throw new Error('A purchased product no longer exists')
        transaction.update(product.ref, { stock: product.data()?.stock + item.quantity, cost: item.unitCost, updatedAt: now })
        transaction.create(db.collection(`shops/${input.shopId}/stockMovements`).doc(), { productId: item.productId, productName: item.name, type: 'purchase', quantity: item.quantity, reason: `Purchase ${purchase.invoiceNumber}`, referenceId: ref.id, createdAt: now })
      })
      transaction.update(ref, { status: 'confirmed', confirmedAt: now, confirmedBy: uid })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'purchase.confirmed', actor: uid, detail: `${purchase.invoiceNumber} stock-in completed`, createdAt: now })
    })
  } catch (error) { safeError(error) }
  return { ok: true }
})
