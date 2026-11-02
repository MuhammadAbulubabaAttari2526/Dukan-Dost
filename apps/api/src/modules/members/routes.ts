import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { z } from 'zod'
import { requireAuth, requireRole, requireTenant } from '../../middleware/auth.js'
import { HttpError, asyncRoute, sendData } from '../../utils/http.js'
import { serializeDocument } from '../../utils/serialization.js'
import { inTransaction } from '../../utils/transaction.js'

const memberSchema = z.object({ email: z.string().email().max(254), role: z.enum(['manager', 'cashier']) }).strict()
const roleSchema = z.object({ role: z.enum(['owner', 'manager', 'cashier']) }).strict()

export function memberRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  router.use(requireAuth(db), requireTenant(db), requireRole('owner'))

  router.get('/', asyncRoute(async (request, response) => {
    const memberships = await db.collection('memberships').find({ shopId: request.tenant!.shopId, active: true }).limit(100).toArray()
    const data = await Promise.all(memberships.map(async (membership) => {
      const user = await db.collection('users').findOne({ _id: membership.userId }, { projection: { name: 1, email: 1 } })
      return { ...(serializeDocument(membership) as Record<string, unknown>), name: user?.name, email: user?.email }
    }))
    sendData(response, data)
  }))

  router.post('/', asyncRoute(async (request, response) => {
    const input = memberSchema.parse(request.body)
    const shopId = request.tenant!.shopId
    const user = await db.collection('users').findOne({ emailLower: input.email.toLowerCase(), disabledAt: { $exists: false } })
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Create an account for this email before assigning shop access')
    if (user._id.equals(request.identity!.userId)) throw new HttpError(422, 'SELF_MEMBERSHIP', 'You cannot replace your own owner membership')
    const existingMembership = await db.collection('memberships').findOne({ userId: user._id, active: true })
    if (existingMembership && !existingMembership.shopId.equals(shopId)) throw new HttpError(409, 'USER_ALREADY_ASSIGNED', 'A user can belong to only one shop')
    try {
      await inTransaction(db, async (session) => {
        await db.collection('memberships').updateOne(
          { shopId, userId: user._id },
          { $set: { role: input.role, active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, session },
        )
        await db.collection('auditLogs').insertOne({
          shopId, actorId: request.identity!.userId, action: 'member.assigned', entity: 'membership', entityId: user._id,
          after: { role: input.role }, createdAt: new Date(),
        }, { session })
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new HttpError(409, 'USER_ALREADY_ASSIGNED', 'A user can belong to only one shop')
      }
      throw error
    }
    sendData(response, { userId: user._id.toHexString(), name: user.name, email: user.email, role: input.role, active: true }, 201)
  }))

  router.patch('/:userId', asyncRoute(async (request, response) => {
    const value = Array.isArray(request.params.userId) ? request.params.userId[0] : request.params.userId
    if (!value || !ObjectId.isValid(value)) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found')
    const userId = new ObjectId(value)
    if (userId.equals(request.identity!.userId)) throw new HttpError(422, 'LAST_OWNER_REQUIRED', 'You cannot change your own owner role')
    const { role } = roleSchema.parse(request.body)
    await inTransaction(db, async (session) => {
      const shopId = request.tenant!.shopId
      await db.collection('shops').updateOne({ _id: shopId }, { $inc: { membershipVersion: 1 } }, { session })
      const membership = await db.collection('memberships').findOne({ shopId, userId, active: true }, { session })
      if (!membership) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found')
      if (membership.role === 'owner' && role !== 'owner') {
        const owners = await db.collection('memberships').countDocuments({ shopId, role: 'owner', active: true }, { session })
        if (owners <= 1) throw new HttpError(409, 'LAST_OWNER_REQUIRED', 'The shop must retain at least one owner')
      }
      await db.collection('memberships').updateOne({ _id: membership._id }, { $set: { role, updatedAt: new Date() } }, { session })
      await db.collection('auditLogs').insertOne({
        shopId, actorId: request.identity!.userId, action: 'member.role_changed', entity: 'membership', entityId: userId,
        before: { role: membership.role }, after: { role }, createdAt: new Date(),
      }, { session })
    })
    sendData(response, { userId: userId.toHexString(), role })
  }))

  router.delete('/:userId', asyncRoute(async (request, response) => {
    const value = Array.isArray(request.params.userId) ? request.params.userId[0] : request.params.userId
    if (!value || !ObjectId.isValid(value)) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found')
    const userId = new ObjectId(value)
    await inTransaction(db, async (session) => {
      const shopId = request.tenant!.shopId
      await db.collection('shops').updateOne({ _id: shopId }, { $inc: { membershipVersion: 1 } }, { session })
      const membership = await db.collection('memberships').findOne({ shopId, userId, active: true }, { session })
      if (!membership) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found')
      if (membership.role === 'owner') {
        const owners = await db.collection('memberships').countDocuments({ shopId, role: 'owner', active: true }, { session })
        if (owners <= 1) throw new HttpError(409, 'LAST_OWNER_REQUIRED', 'The last owner cannot be removed')
      }
      await db.collection('memberships').updateOne({ _id: membership._id }, { $set: { active: false, removedAt: new Date() } }, { session })
      await db.collection('auditLogs').insertOne({
        shopId, actorId: request.identity!.userId, action: 'member.removed', entity: 'membership', entityId: userId,
        before: { role: membership.role }, createdAt: new Date(),
      }, { session })
    })
    response.status(204).end()
  }))

  return router
}
