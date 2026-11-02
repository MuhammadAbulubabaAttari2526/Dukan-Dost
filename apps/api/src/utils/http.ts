import type { ErrorRequestHandler, RequestHandler, Response } from 'express'
import { ZodError } from 'zod'
import { logger } from '../config/logger.js'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function sendData<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ data })
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next
  if (error instanceof ZodError) {
    response.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues } })
    return
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    response.status(409).json({ error: { code: 'DUPLICATE_RECORD', message: 'A record with the same unique value already exists' } })
    return
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } })
    return
  }
  logger.error({ err: error, method: request.method, path: request.path }, 'Unhandled request error')
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
}

export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}
