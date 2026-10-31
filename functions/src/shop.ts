import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db, enforceRateLimit, parse, requireShopRole, requireUid, requireWritableShop } from './helpers.js'

const options = { region: 'asia-south1', maxInstances: 10 } as const
const createShopSchema = z.object({ name: z.string().trim().min(2).max(100), contact: z.string().trim().min(10).max(20), address: z.string().trim().min(5).max(240) })

export const createShop = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  await enforceRateLimit(uid, 'createShop', 10)
  const input = parse(createShopSchema, request.data)
  const userRef = db.doc(`users/${uid}`)
  const user = await userRef.get()
  if (!user.exists || user.data()?.shopId) throw new Error('This account already has a shop or is not registered')
  const shopRef = db.collection('shops').doc()
  const subscriptionRef = db.collection(`shops/${shopRef.id}/subscriptions`).doc()
  const auditRef = db.collection(`shops/${shopRef.id}/auditLogs`).doc()
  const renewal = new Date(Date.now() + 14 * 86400000)
  const batch = db.batch()
  batch.create(shopRef, { ...input, status: 'active', plan: 'business', subscriptionStatus: 'trial', ownerId: uid, renewalDate: Timestamp.fromDate(renewal), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  batch.create(db.doc(`shops/${shopRef.id}/members/${uid}`), { role: 'owner', email: user.data()?.email, joinedAt: FieldValue.serverTimestamp() })
  batch.update(userRef, { shopId: shopRef.id, role: 'owner', updatedAt: FieldValue.serverTimestamp() })
  batch.create(subscriptionRef, { plan: 'business', status: 'trial', startDate: FieldValue.serverTimestamp(), renewalDate: Timestamp.fromDate(renewal), note: '14-day Business trial; no payment collected' })
  batch.create(auditRef, { action: 'shop.created', actor: uid, detail: `Shop ${input.name} created with owner membership`, createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { shopId: shopRef.id }
})

export const updateShopProfile = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(createShopSchema.extend({ shopId: z.string().min(3), logoUrl: z.string().url().max(1000).optional() }), request.data)
  await enforceRateLimit(uid, 'updateShopProfile', 30)
  await requireShopRole(uid, input.shopId, ['owner'])
  await requireWritableShop(input.shopId)
  const batch = db.batch()
  batch.update(db.doc(`shops/${input.shopId}`), { name: input.name, contact: input.contact, address: input.address, logoUrl: input.logoUrl ?? null, updatedAt: FieldValue.serverTimestamp() })
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'shop.profile_updated', actor: uid, detail: 'Shop profile updated', createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { ok: true }
})

export const assignMember = onCall(options, async (request) => {
  const uid = requireUid(request.auth)
  const input = parse(z.object({ shopId: z.string().min(3), email: z.string().email(), role: z.enum(['manager', 'cashier']) }), request.data)
  await enforceRateLimit(uid, 'assignMember', 30)
  await requireShopRole(uid, input.shopId, ['owner'])
  await requireWritableShop(input.shopId)
  const target = await getAuth().getUserByEmail(input.email)
  const userRef = db.doc(`users/${target.uid}`)
  const profile = await userRef.get()
  if (profile.data()?.shopId && profile.data()?.shopId !== input.shopId) throw new Error('This user already belongs to another shop')
  const batch = db.batch()
  batch.set(db.doc(`shops/${input.shopId}/members/${target.uid}`), { role: input.role, email: input.email, joinedAt: FieldValue.serverTimestamp() }, { merge: true })
  batch.set(userRef, { name: target.displayName ?? input.email.split('@')[0], email: input.email, shopId: input.shopId, role: input.role, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  batch.create(db.collection(`shops/${input.shopId}/auditLogs`).doc(), { action: 'member.role_assigned', actor: uid, detail: `${input.email} assigned ${input.role}`, createdAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { ok: true }
})
