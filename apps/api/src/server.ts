import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { connectDatabase, createIndexes } from './db/connection.js'
import { createApp } from './app.js'
import { expireOverdueSubscriptions } from './jobs/subscriptions.js'

const database = await connectDatabase()
await createIndexes(database)
await expireOverdueSubscriptions(database).catch((error: unknown) => logger.error({ err: error }, 'Subscription expiry run failed'))
const subscriptionJob = setInterval(() => {
  void expireOverdueSubscriptions(database).catch((error: unknown) => logger.error({ err: error }, 'Subscription expiry run failed'))
}, 24 * 60 * 60_000)
subscriptionJob.unref()
const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Dukaan Dost API listening')
})

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down API')
  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server shutdown failed')
      process.exitCode = 1
    }
    const { closeDatabase } = await import('./db/connection.js')
    await closeDatabase()
  })
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
