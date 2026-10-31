import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import functionsTest from 'firebase-functions-test'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)
const factory = functionsTest({ projectId: 'dukaan-dost-functions-test' })
let createSaleCallable: any
let confirmPurchaseCallable: any
const auth = { uid: 'owner1', token: {} }

describe.skipIf(!enabled)('Cloud Function transaction integration', () => {
  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = 'dukaan-dost-functions-test'
    const functions = await import('../../functions/src/index')
    createSaleCallable = factory.wrap(functions.createSale)
    confirmPurchaseCallable = factory.wrap(functions.confirmPurchase)
    const db = getFirestore()
    await db.doc('shops/shop1').set({ name: 'Test Shop', status: 'active', plan: 'business', subscriptionStatus: 'active', renewalDate: Timestamp.fromDate(new Date(Date.now() + 86400000)) })
    await db.doc('shops/shop1/members/owner1').set({ role: 'owner' })
    await db.doc('shops/shop1/products/p1').set({ name: 'Tea', sku: 'T1', unit: 'pack', price: 150, cost: 100, stock: 5, archived: false })
    await db.doc('shops/shop1/purchases/po1').set({ supplierId: 's1', supplierName: 'Supplier', invoiceNumber: 'INV1', items: [{ productId: 'p1', name: 'Tea', quantity: 4, unitCost: 95 }], status: 'draft', total: 380 })
  })
  afterAll(async () => { await factory.cleanup() })

  it('creates a sale idempotently and deducts stock exactly once', async () => {
    const input = { shopId: 'shop1', items: [{ productId: 'p1', quantity: 2 }], discount: 0, paymentMethod: 'cash', amountPaid: 300, idempotencyKey: 'transaction_sale_once' }
    const first = await createSaleCallable(input, { auth })
    const second = await createSaleCallable(input, { auth })
    expect(second.id).toBe(first.id)
    expect((await getFirestore().doc('shops/shop1/products/p1').get()).data()?.stock).toBe(3)
    expect((await getFirestore().collection('shops/shop1/stockMovements').where('referenceId', '==', first.id).get()).size).toBe(1)
  })

  it('confirms purchase stock-in once and rejects a repeated confirmation', async () => {
    await confirmPurchaseCallable({ shopId: 'shop1', id: 'po1' }, { auth })
    expect((await getFirestore().doc('shops/shop1/products/p1').get()).data()?.stock).toBe(7)
    await expect(confirmPurchaseCallable({ shopId: 'shop1', id: 'po1' }, { auth })).rejects.toThrow()
  })
})
