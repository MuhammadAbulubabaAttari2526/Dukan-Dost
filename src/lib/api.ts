import { getAccessToken, setAccessToken } from './apiSession'

const API_BASE_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || 'http://localhost:4000/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ApiEnvelope<T> {
  data: T
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown }
}

function csrfCookie(): string | undefined {
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('dd_csrf='))
  if (!cookie) return undefined
  try {
    return decodeURIComponent(cookie.slice('dd_csrf='.length))
  } catch {
    return undefined
  }
}

let refreshInFlight: Promise<string | null> | undefined

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const csrf = csrfCookie()
      if (!csrf) return null
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf },
      })
      if (!response.ok) {
        setAccessToken(null)
        return null
      }
      const result = await response.json() as ApiEnvelope<{ accessToken: string }>
      setAccessToken(result.data.accessToken)
      return result.data.accessToken
    })().finally(() => {
      refreshInFlight = undefined
    })
  }
  return refreshInFlight
}

async function execute<T>(path: string, init: RequestInit, retry: boolean): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const token = getAccessToken()
  if (token) headers.set('authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && retry && !path.endsWith('/auth/refresh')) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return execute<T>(path, init, false)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as ErrorEnvelope | undefined
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? `Request failed with status ${response.status}`,
      body?.error?.details,
    )
  }
  if (response.status === 204) return undefined as T
  const body = await response.json() as ApiEnvelope<T>
  return body.data
}

export const api = {
  request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return execute<T>(path, init, true)
  },
  get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  },
  post<T>(path: string, body?: unknown, options: { idempotencyKey?: string } = {}): Promise<T> {
    const headers = new Headers()
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
    return this.request<T>(path, { method: 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  },
  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  },
}

export const apiConfigured = true
