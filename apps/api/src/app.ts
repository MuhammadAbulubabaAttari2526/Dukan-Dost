import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { Db } from 'mongodb'
import { corsOrigins, env } from './config/env.js'
import { logger } from './config/logger.js'
import { getDatabase } from './db/connection.js'
import { authRouter } from './modules/auth/routes.js'
import { shopRouter } from './modules/shops/routes.js'
import { productRouter } from './modules/products/routes.js'
import { salesRouter } from './modules/sales/routes.js'
import { operationsRouter } from './modules/operations/routes.js'
import { adminRouter } from './modules/admin/routes.js'
import { memberRouter } from './modules/members/routes.js'
import { errorHandler, notFoundHandler } from './utils/http.js'

export function createApp(database: Db = getDatabase()): express.Express {
  const app = express()
  if (env.TRUST_PROXY) app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin is not allowed by CORS'))
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb', strict: true }))
  app.use(pinoHttp({ logger }))
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }))

  app.get('/health', (_request, response) => response.json({ data: { status: 'ok' } }))
  app.get('/ready', async (_request, response, next) => {
    try {
      await database.command({ ping: 1 })
      response.json({ data: { status: 'ready' } })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api/v1/auth', authRouter(database))
  app.use('/api/v1/admin', adminRouter(database))
  app.use('/api/v1/shops', shopRouter(database))
  app.use('/api/v1/shops/:shopId/members', memberRouter(database))
  app.use('/api/v1/shops/:shopId/products', productRouter(database))
  app.use('/api/v1/shops/:shopId/sales', salesRouter(database))
  app.use('/api/v1/shops/:shopId', operationsRouter(database))
  app.use('/api/v1', (_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } })
  })
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
