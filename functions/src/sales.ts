import { FieldValue } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { calculateTotals, discountLimit, snapshotItems, type ProductSnapshot, type Role } from './domain.js'
import { db, enforceRateLimit, parse, requireShopRole, requireUid, requireWritableShop, safeError } from './helpers.js'
import { paymentSchema, saleSchema } from './validation.js'

const options = { region: 'asia-south1', maxInstances: 20 } as const
const iso = (value: unknown) => value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value

export const createSale = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(saleSchema, request.data)
  await enforceRateLimit(uid, 'createSale')
  const role = await requireShopRole(uid, input.shopId, ['owner', 'manager', 'cashier'])
  await requireWritableShop(input.shopId)
  try {
    return await db.runTransaction(async (transaction) => {
      const requestRef = db.doc(`shops/${input.shopId}/requests/${input.idempotencyKey}`)
      const previous = await transaction.get(requestRef)
      if (previous.exists) {
        const sale = await transaction.get(db.doc(`shops/${input.shopId}/sales/${previous.data()?.saleId}`))
        return { id: sale.id, ...sale.data(), createdAt: iso(sale.data()?.createdAt) }
      }
      const productRefs = [...new Set(input.items.map((item) => item.productId))].map((id) => db.doc(`shops/${input.shopId}/products/${id}`))
      const productDocs = await Promise.all(productRefs.map((ref) => transaction.get(ref)))
      const customer = input.customerId ? await transaction.get(db.doc(`shops/${input.shopId}/customers/${input.customerId}`)) : null
      if (input.customerId && !customer?.exists) throw new Error('Customer not found in this shop')
      const products: ProductSnapshot[] = productDocs.filter((document) => document.exists).map((document) => ({ id: document.id, ...document.data() } as ProductSnapshot))
      const items = snapshotItems(products, input.items)
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      if (input.discount > subtotal * discountLimit(role as Role)) throw new Error('Discount exceeds your role limit')
      const totals = calculateTotals(items, input.discount, input.amountPaid)
      if (input.paymentMethod === 'credit' && !input.customerId) throw new Error('Select a customer for a credit sale')
      if (totals.balanceDue > 0 && !input.customerId) throw new Error('An unpaid balance requires a customer')
      if (input.paymentMethod !== 'credit' && totals.balanceDue > 0) throw new Error('Cash and digital sales must be fully paid')
      const saleRef = db.collection(`shops/${input.shopId}/sales`).doc()
      const now = FieldValue.serverTimestamp()
      const createdAt = new Date().toISOString()
      const receiptNumber = `DD-${Date.now().toString().slice(-7)}${saleRef.id.slice(0, 3).toUpperCase()}`
      const sale = { receiptNumber, items, ...totals, paymentMethod: input.paymentMethod, customerId: input.customerId ?? null, customerName: customer?.data()?.name ?? null, status: 'completed', createdAt: now, createdBy: uid, idempotencyKey: input.idempotencyKey }
      transaction.create(saleRef, sale)
      items.forEach((item) => {
        const product = products.find((entry) => entry.id === item.productId)!
        transaction.update(db.doc(`shops/${input.shopId}/products/${item.productId}`), { stock: product.stock - item.quantity, updatedAt: now })
        transaction.create(db.collection(`shops/${input.shopId}/stockMovements`).doc(), { productId: item.productId, productName: item.name, type: 'sale', quantity: -item.quantity, reason: `Sale ${receiptNumber}`, referenceId: saleRef.id, createdAt: now })
      })
      if (totals.amountPaid > 0) transaction.create(db.collection(`shops/${input.shopId}/payments`).doc(), { customerId: input.customerId ?? null, saleId: saleRef.id, amount: totals.amountPaid, method: input.paymentMethod === 'digital' ? 'digital' : 'cash', type: 'sale', idempotencyKey: input.idempotencyKey, createdAt: now })
      if (totals.balanceDue > 0) transaction.create(db.collection(`shops/${input.shopId}/ledger`).doc(), { customerId: input.customerId, type: 'credit_sale', amount: totals.balanceDue, referenceId: saleRef.id, note: `Credit sale ${receiptNumber}`, createdAt: now })
      transaction.create(requestRef, { saleId: saleRef.id, operation: 'sale', createdAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'sale.completed', actor: uid, detail: `${receiptNumber} completed for PKR ${totals.total}`, createdAt: now })
      return { id: saleRef.id, ...sale, createdAt }
    })
  } catch (error) { safeError(error) }
})

export const returnSale = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(z.object({ shopId: z.string().min(3), id: z.string().min(1) }), request.data)
  await enforceRateLimit(uid, 'returnSale', 60)
  await requireShopRole(uid, input.shopId, ['owner', 'manager'])
  await requireWritableShop(input.shopId)
  try {
    await db.runTransaction(async (transaction) => {
      const saleRef = db.doc(`shops/${input.shopId}/sales/${input.id}`)
      const snapshot = await transaction.get(saleRef)
      const sale = snapshot.data()
      if (!sale) throw new Error('Sale not found')
      if (sale.status === 'returned') return
      if (sale.status !== 'completed') throw new Error('Only completed sales can be returned')
      const productDocs = await Promise.all(sale.items.map((item: { productId: string }) => transaction.get(db.doc(`shops/${input.shopId}/products/${item.productId}`))))
      const now = FieldValue.serverTimestamp()
      transaction.update(saleRef, { status: 'returned', returnedAt: now, returnedBy: uid })
      sale.items.forEach((item: { productId: string; productName?: string; name: string; quantity: number }) => {
        const product = productDocs.find((document) => document.id === item.productId)
        if (!product.exists) throw new Error('A returned product no longer exists')
        transaction.update(product.ref, { stock: product.data()?.stock + item.quantity, updatedAt: now })
        transaction.create(db.collection(`shops/${input.shopId}/stockMovements`).doc(), { productId: item.productId, productName: item.name, type: 'return', quantity: item.quantity, reason: `Return ${sale.receiptNumber}`, referenceId: saleRef.id, createdAt: now })
      })
      if (sale.customerId && sale.balanceDue > 0) transaction.create(db.collection(`shops/${input.shopId}/ledger`).doc(), { customerId: sale.customerId, type: 'return', amount: -sale.balanceDue, referenceId: saleRef.id, note: `Return ${sale.receiptNumber}`, createdAt: now })
      if (sale.amountPaid > 0) transaction.create(db.doc(`shops/${input.shopId}/payments/return_${saleRef.id}`), { customerId: sale.customerId ?? null, saleId: saleRef.id, amount: sale.amountPaid, method: sale.paymentMethod === 'digital' ? 'digital' : 'cash', type: 'refund', idempotencyKey: `return_${saleRef.id}`, createdAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'sale.returned', actor: uid, detail: `${sale.receiptNumber} returned and restocked`, createdAt: now })
    })
  } catch (error) { safeError(error) }
  return { ok: true }
})

export const recordCustomerPayment = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(paymentSchema, request.data)
  await enforceRateLimit(uid, 'recordCustomerPayment')
  await requireShopRole(uid, input.shopId, ['owner', 'manager'])
  await requireWritableShop(input.shopId)
  try {
    await db.runTransaction(async (transaction) => {
      const requestRef = db.doc(`shops/${input.shopId}/requests/${input.idempotencyKey}`)
      const previous = await transaction.get(requestRef)
      if (previous.exists) return
      const customerRef = db.doc(`shops/${input.shopId}/customers/${input.customerId}`)
      const customer = await transaction.get(customerRef)
      if (!customer.exists) throw new Error('Customer not found')
      const ledger = await transaction.get(db.collection(`shops/${input.shopId}/ledger`).where('customerId', '==', input.customerId))
      const balance = ledger.docs.reduce((sum, document) => sum + Number(document.data().amount), 0)
      if (input.amount > balance) throw new Error('Payment exceeds the outstanding balance')
      const now = FieldValue.serverTimestamp()
      const paymentRef = db.collection(`shops/${input.shopId}/payments`).doc()
      transaction.create(paymentRef, { customerId: input.customerId, amount: input.amount, method: input.method, type: 'credit_payment', idempotencyKey: input.idempotencyKey, createdAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/ledger`).doc(), { customerId: input.customerId, type: 'payment', amount: -input.amount, referenceId: paymentRef.id, note: `${input.method} payment`, createdAt: now })
      transaction.create(requestRef, { paymentId: paymentRef.id, operation: 'customer_payment', createdAt: now })
      transaction.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'payment.recorded', actor: uid, detail: `PKR ${input.amount} received from ${customer.data()?.name}`, createdAt: now })
    })
  } catch (error) { safeError(error) }
  return { ok: true }
})
