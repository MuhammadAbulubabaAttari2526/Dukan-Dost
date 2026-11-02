import { ObjectId } from 'mongodb'
import { closeDatabase, connectDatabase, createIndexes } from '../src/db/connection.js'

if (process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Set ALLOW_DEMO_SEED=true to seed the isolated demo shop')
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LIVE_DEMO_SEED !== 'true') {
  throw new Error('Production seeding additionally requires ALLOW_LIVE_DEMO_SEED=true')
}
const email = process.env.DEMO_OWNER_EMAIL?.trim().toLowerCase()
if (!email) throw new Error('Set DEMO_OWNER_EMAIL to an existing account')

try {
  const db = await connectDatabase()
  await createIndexes(db)
  const owner = await db.collection('users').findOne({ emailLower: email, disabledAt: { $exists: false } })
  if (!owner) throw new Error('The demo owner account must be registered before seeding')

  const now = new Date()
  let shop = await db.collection('shops').findOne({ seedKey: 'demo_seed_shop' })
  const shopId = shop?._id ?? new ObjectId()
  const renewalDate = new Date(now.getTime() + 30 * 24 * 60 * 60_000)
  if (!shop) {
    shop = {
      _id: shopId,
      seedKey: 'demo_seed_shop',
      name: 'Dukaan Dost Demo Shop',
      contact: '+92 300 0000000',
      address: 'Demo address, Karachi',
      status: 'active',
      plan: 'starter',
      subscriptionStatus: 'trial',
      renewalDate,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('shops').insertOne(shop)
  }
  await db.collection('memberships').updateOne(
    { shopId, userId: owner._id },
    { $set: { role: 'owner', active: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )

  const samples = [
    { name: 'Demo Tea 950g', sku: 'DEMO-TEA-950', category: 'Grocery', unit: 'pack', cost: 1320, price: 1480, stock: 18 },
    { name: 'Demo Cooking Oil 5L', sku: 'DEMO-OIL-5L', category: 'Grocery', unit: 'bottle', cost: 3440, price: 3790, stock: 7 },
    { name: 'Demo A4 Paper', sku: 'DEMO-PAPER-A4', category: 'Stationery', unit: 'ream', cost: 1280, price: 1450, stock: 9 },
  ]
  for (const sample of samples) {
    const existing = await db.collection('products').findOne({ shopId, skuLower: sample.sku.toLowerCase() })
    if (existing) continue
    const productId = new ObjectId()
    await db.collection('products').insertOne({
      _id: productId,
      shopId,
      name: sample.name,
      sku: sample.sku,
      skuLower: sample.sku.toLowerCase(),
      category: sample.category,
      unit: sample.unit,
      costPaisa: sample.cost * 100,
      pricePaisa: sample.price * 100,
      stock: sample.stock,
      lowStockThreshold: 5,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })
    await db.collection('stockMovements').insertOne({
      shopId, productId, productName: sample.name, type: 'opening', quantity: sample.stock,
      reason: 'Demo seed', actorId: owner._id, createdAt: now,
    })
  }
  await db.collection('auditLogs').insertOne({
    shopId,
    actorId: owner._id,
    action: 'demo.seeded',
    entity: 'shop',
    entityId: shopId,
    createdAt: now,
  })
  console.info(`Demo shop is ready for ${owner.email} (${shopId.toHexString()}).`)
} finally {
  await closeDatabase()
}
