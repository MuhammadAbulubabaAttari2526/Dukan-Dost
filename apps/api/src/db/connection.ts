import { MongoClient, type Db } from 'mongodb'
import { env } from '../config/env.js'

let client: MongoClient | undefined
let database: Db | undefined

export async function connectDatabase(): Promise<Db> {
  if (database) return database
  client = new MongoClient(env.MONGODB_URI, { appName: 'dukaan-dost-api', retryWrites: true })
  await client.connect()
  database = client.db(env.MONGODB_DB)
  await database.command({ ping: 1 })
  return database
}

export function getDatabase(): Db {
  if (!database) throw new Error('Database has not been connected')
  return database
}

export async function closeDatabase(): Promise<void> {
  await client?.close()
  client = undefined
  database = undefined
}

export async function createIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('users').createIndex({ emailLower: 1 }, { unique: true }),
    db.collection('memberships').createIndex({ shopId: 1, userId: 1 }, { unique: true }),
    db.collection('memberships').createIndex({ userId: 1, active: 1 }),
    db.collection('memberships').createIndex({ userId: 1 }, { unique: true, partialFilterExpression: { active: true } }),
    db.collection('shops').createIndex({ createdAt: -1 }),
    db.collection('shops').createIndex({ seedKey: 1 }, { unique: true, partialFilterExpression: { seedKey: { $type: 'string' } } }),
    db.collection('shops').createIndex({ status: 1, subscriptionStatus: 1, renewalDate: 1 }),
    db.collection('products').createIndex({ shopId: 1, skuLower: 1 }, { unique: true }),
    db.collection('products').createIndex({ shopId: 1, archived: 1, name: 1 }),
    db.collection('products').createIndex({ shopId: 1, name: 'text', sku: 'text' }),
    db.collection('sales').createIndex({ shopId: 1, createdAt: -1 }),
    db.collection('sales').createIndex({ shopId: 1, receiptNumber: 1 }, { unique: true }),
    db.collection('sales').createIndex({ shopId: 1, customerId: 1, createdAt: -1 }),
    db.collection('ledgerEntries').createIndex({ shopId: 1, customerId: 1, createdAt: 1 }),
    db.collection('supplierLedger').createIndex({ shopId: 1, supplierId: 1, createdAt: 1 }),
    db.collection('stockMovements').createIndex({ shopId: 1, productId: 1, createdAt: -1 }),
    db.collection('purchases').createIndex({ shopId: 1, supplierId: 1, invoiceNumber: 1 }, { unique: true }),
    db.collection('idempotencyKeys').createIndex({ shopId: 1, key: 1 }, { unique: true }),
    db.collection('idempotencyKeys').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('auditLogs').createIndex({ shopId: 1, createdAt: -1 }),
    db.collection('adminAuditLogs').createIndex({ createdAt: -1 }),
    db.collection('authAuditLogs').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('refreshTokens').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('refreshTokens').createIndex({ familyId: 1, revokedAt: 1 }),
    db.collection('refreshTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('passwordResetTokens').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('passwordResetTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('loginAttempts').createIndex({ key: 1 }, { unique: true }),
    db.collection('loginAttempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('counters').createIndex({ shopId: 1, name: 1 }, { unique: true }),
  ])
}
