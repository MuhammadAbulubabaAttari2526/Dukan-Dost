import { closeDatabase, connectDatabase, createIndexes } from '../src/db/connection.js'

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
if (process.env.CONFIRM_SUPER_ADMIN !== 'true' || !email) {
  throw new Error('Set SUPER_ADMIN_EMAIL and CONFIRM_SUPER_ADMIN=true to provision an existing account')
}

try {
  const db = await connectDatabase()
  await createIndexes(db)
  const user = await db.collection('users').findOneAndUpdate(
    { emailLower: email, disabledAt: { $exists: false } },
    { $set: { isSuperAdmin: true, updatedAt: new Date() }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after', projection: { _id: 1, email: 1 } },
  )
  if (!user) throw new Error(`No active account exists for ${email}`)
  await db.collection('adminAuditLogs').insertOne({
    actorId: user._id,
    action: 'super_admin.provisioned',
    targetEmail: user.email,
    createdAt: new Date(),
  })
  console.info(`Provisioned super-admin access for ${user.email}. Re-authenticate to receive a fresh session.`)
} finally {
  await closeDatabase()
}
