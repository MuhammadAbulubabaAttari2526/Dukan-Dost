import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/dukaan_dost?replicaSet=rs0'),
  MONGODB_DB: z.string().min(1).default('dukaan_dost'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(32).default('0123456789abcdef0123456789abcdef'),
  JWT_REFRESH_SECRET: z.string().min(32).default('abcdef0123456789abcdef0123456789'),
  ACCESS_TOKEN_TTL: z.enum(['5m', '10m', '15m', '20m', '30m']).default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
})

const raw = {
  ...process.env,
  MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/dukaan_dost?replicaSet=rs0',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:3000',
}

const parsed = schema.safeParse(raw)
if (!parsed.success) {
  const issues = parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ')
  throw new Error(`Invalid API environment: ${issues}`)
}

if (parsed.data.NODE_ENV === 'production' && (!parsed.data.COOKIE_SECURE || (parsed.data.COOKIE_SAME_SITE === 'none' && !parsed.data.COOKIE_SECURE))) {
  throw new Error('Production refresh cookies must be Secure')
}
if (parsed.data.NODE_ENV === 'production' && (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error('Production JWT secrets must be explicitly configured')
}
if (parsed.data.NODE_ENV === 'production' && (
  parsed.data.JWT_ACCESS_SECRET === '0123456789abcdef0123456789abcdef'
  || parsed.data.JWT_REFRESH_SECRET === 'abcdef0123456789abcdef0123456789'
  || parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET
)) {
  throw new Error('Production JWT secrets must be unique, non-placeholder values')
}
if (parsed.data.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
  throw new Error('Production CORS_ORIGINS must be explicitly configured')
}

export const env = parsed.data
export const corsOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
