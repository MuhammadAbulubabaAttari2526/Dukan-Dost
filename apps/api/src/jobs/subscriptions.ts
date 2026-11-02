import type { Db } from 'mongodb'
import { inTransaction } from '../utils/transaction.js'

export async function expireOverdueSubscriptions(db: Db, now = new Date()): Promise<number> {
  const overdue = await db.collection('shops').find({
    status: 'active',
    subscriptionStatus: { $in: ['trial', 'active', 'past_due'] },
    renewalDate: { $lt: now },
  }, { projection: { _id: 1, subscriptionStatus: 1, plan: 1, renewalDate: 1 } }).limit(500).toArray()

  let expiredCount = 0
  for (const shop of overdue) {
    const changed = await inTransaction(db, async (session) => {
      const changed = await db.collection('shops').updateOne({
        _id: shop._id,
        subscriptionStatus: shop.subscriptionStatus,
        renewalDate: { $lt: now },
      }, { $set: { subscriptionStatus: 'expired', updatedAt: now } }, { session })
      if (changed.modifiedCount !== 1) return false
      await db.collection('subscriptions').insertOne({
        shopId: shop._id,
        plan: shop.plan,
        status: 'expired',
        startDate: shop.renewalDate,
        renewalDate: shop.renewalDate,
        note: 'Expired by scheduled subscription job',
        createdAt: now,
      }, { session })
      await db.collection('auditLogs').insertOne({
        shopId: shop._id,
        action: 'subscription.expired',
        entity: 'subscription',
        createdAt: now,
      }, { session })
      return true
    })
    if (changed) expiredCount += 1
  }
  return expiredCount
}
