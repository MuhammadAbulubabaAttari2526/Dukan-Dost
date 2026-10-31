import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

if (process.env.ALLOW_DEMO_SEED !== 'true' || !process.env.DEMO_OWNER_UID) {
  console.error('Refusing to seed. Set ALLOW_DEMO_SEED=true and DEMO_OWNER_UID for an emulator or disposable demo project.')
  process.exit(1)
}
if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.ALLOW_LIVE_DEMO_SEED !== 'true') {
  console.error('Live project seeding also requires ALLOW_LIVE_DEMO_SEED=true. Use a disposable demo project, never production customer data.')
  process.exit(1)
}
initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const shopId = 'demo_seed_shop'
const batch = db.batch()
batch.set(db.doc(`shops/${shopId}`), { name: 'DEMO — Karachi General Store', contact: '+92 300 0000000', address: 'North Nazimabad, Karachi', status: 'active', plan: 'business', subscriptionStatus: 'trial', renewalDate: Timestamp.fromDate(new Date(Date.now() + 14 * 86400000)), createdAt: FieldValue.serverTimestamp() })
batch.set(db.doc(`shops/${shopId}/members/${process.env.DEMO_OWNER_UID}`), { role: 'owner', joinedAt: FieldValue.serverTimestamp() })
batch.set(db.doc(`users/${process.env.DEMO_OWNER_UID}`), { shopId, role: 'owner' }, { merge: true })
const products = [
  { name: 'DEMO Tapal Tea 950g', sku: 'DEMO-TEA-950', category: 'Grocery', unit: 'pack', cost: 1320, price: 1480, stock: 20, lowStockThreshold: 5 },
  { name: 'DEMO Coca-Cola 1.5L', sku: 'DEMO-COLA-15', category: 'Beverages', unit: 'bottle', cost: 205, price: 250, stock: 30, lowStockThreshold: 10 },
  { name: 'DEMO A4 Paper Ream', sku: 'DEMO-A4-80', category: 'Stationery', unit: 'ream', cost: 1280, price: 1450, stock: 8, lowStockThreshold: 4 },
]
products.forEach((product) => {
  const ref = db.collection(`shops/${shopId}/products`).doc()
  batch.set(ref, { ...product, archived: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  batch.set(db.collection(`shops/${shopId}/stockMovements`).doc(), { productId: ref.id, productName: product.name, type: 'opening', quantity: product.stock, reason: 'Explicit demo seed', createdAt: FieldValue.serverTimestamp() })
})
batch.set(db.collection(`shops/${shopId}/subscriptions`).doc(), { plan: 'business', status: 'trial', startDate: FieldValue.serverTimestamp(), renewalDate: Timestamp.fromDate(new Date(Date.now() + 14 * 86400000)), note: 'Explicit demo seed; no payment collected' })
await batch.commit()
console.log(`Seeded isolated demo shop: ${shopId}`)
