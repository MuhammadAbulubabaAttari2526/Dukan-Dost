import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

export const db = getFirestore()
export type Role = 'owner' | 'manager' | 'cashier'

export function requireUid(auth?: { uid: string }) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue')
  return auth.uid
}

export async function enforceRateLimit(uid: string, action: string, maximum = 120) {
  const ref = db.collection('rateLimits').doc(`${uid}_${action}`)
  const window = Math.floor(Date.now() / 60_000)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const data = snapshot.data()
    const count = data?.window === window ? data.count + 1 : 1
    if (count > maximum) throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.')
    transaction.set(ref, { window, count, updatedAt: FieldValue.serverTimestamp() })
  })
}

export async function requireShopRole(uid: string, shopId: string, roles: Role[]) {
  const member = await db.doc(`shops/${shopId}/members/${uid}`).get()
  const role = member.data()?.role as Role | undefined
  if (!member.exists || !role || !roles.includes(role)) throw new HttpsError('permission-denied', 'You are not authorized for this shop operation')
  return role
}

export async function requireWritableShop(shopId: string) {
  const snapshot = await db.doc(`shops/${shopId}`).get()
  const shop = snapshot.data()
  if (!shop || shop.status !== 'active') throw new HttpsError('failed-precondition', 'This shop is suspended')
  if (!['trial', 'active'].includes(shop.subscriptionStatus)) throw new HttpsError('failed-precondition', 'Subscription is not active. Export and account access remain available.')
  if (shop.renewalDate?.toDate && shop.renewalDate.toDate() < new Date()) throw new HttpsError('failed-precondition', 'Subscription has expired. Renew to resume business writes.')
}

export function requireSuperAdmin(auth?: { uid: string; token: Record<string, unknown> }) {
  requireUid(auth)
  if (auth?.token.superAdmin !== true) throw new HttpsError('permission-denied', 'Explicit super-admin authorization is required')
}

export function audit(shopId: string, action: string, actor: string, detail: string) {
  return db.collection(`shops/${shopId}/auditLogs`).doc().create({ action, actor, detail, createdAt: FieldValue.serverTimestamp() })
}

export function parse<T>(schema: { parse: (value: unknown) => T }, value: unknown) {
  try { return schema.parse(value) } catch { throw new HttpsError('invalid-argument', 'Submitted data failed validation') }
}

export function safeError(error: unknown): never {
  if (error instanceof HttpsError) throw error
  throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Operation could not be completed')
}
