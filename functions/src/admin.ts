import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db, enforceRateLimit, parse, requireSuperAdmin } from './helpers.js'

const options = { region: 'asia-south1', maxInstances: 5 } as const

export const updateShopAdmin = onCall(options, async (request) => {
  requireSuperAdmin(request.auth)
  const uid = request.auth!.uid
  const input = parse(z.object({
    shopId: z.string().min(3), status: z.enum(['active', 'suspended']).optional(),
    plan: z.enum(['starter', 'business']).optional(),
    subscriptionStatus: z.enum(['trial', 'active', 'past_due', 'expired', 'cancelled']).optional(),
    renewalDate: z.string().datetime().optional(),
  }).strict().refine((value) => Object.keys(value).length > 1), request.data)
  await enforceRateLimit(uid, 'updateShopAdmin', 60)
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (input.status) patch.status = input.status
  if (input.plan) patch.plan = input.plan
  if (input.subscriptionStatus) patch.subscriptionStatus = input.subscriptionStatus
  if (input.renewalDate) patch.renewalDate = Timestamp.fromDate(new Date(input.renewalDate))
  else if (input.subscriptionStatus === 'active') patch.renewalDate = Timestamp.fromDate(new Date(Date.now() + 30 * 86400000))
  const batch = db.batch()
  batch.update(db.doc(`shops/${input.shopId}`), patch)
  if (input.plan || input.subscriptionStatus || input.renewalDate) {
    const current = await db.doc(`shops/${input.shopId}`).get()
    batch.create(db.collection(`shops/${input.shopId}/subscriptions`).doc(), {
      plan: input.plan ?? current.data()?.plan,
      status: input.subscriptionStatus ?? current.data()?.subscriptionStatus,
      startDate: FieldValue.serverTimestamp(),
      renewalDate: patch.renewalDate ?? current.data()?.renewalDate,
      note: `Manually recorded by authorized super admin ${uid}`,
    })
  }
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'admin.shop_updated', actor: uid, detail: `Administrative fields updated: ${Object.keys(patch).filter((key) => key !== 'updatedAt').join(', ')}`, createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { ok: true }
})

export const adminListShops = onCall(options, async (request) => {
  requireSuperAdmin(request.auth)
  await enforceRateLimit(request.auth!.uid, 'adminListShops', 60)
  const shops = await db.collection('shops').orderBy('createdAt', 'desc').limit(200).get()
  return Promise.all(shops.docs.map(async (document) => {
    const [owners, products, sales] = await Promise.all([
      db.collection(`shops/${document.id}/members`).where('role', '==', 'owner').limit(1).get(),
      db.collection(`shops/${document.id}/products`).count().get(),
      db.collection(`shops/${document.id}/sales`).count().get(),
    ])
    return {
      id: document.id,
      ...document.data(),
      renewalDate: document.data().renewalDate?.toDate?.().toISOString(),
      createdAt: document.data().createdAt?.toDate?.().toISOString(),
      ownerEmail: owners.docs[0]?.data().email,
      productCount: products.data().count,
      salesCount: sales.data().count,
    }
  }))
})
