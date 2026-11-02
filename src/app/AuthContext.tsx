/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, apiConfigured } from '@/lib/api'
import { setAccessToken } from '@/lib/apiSession'
import { demoShop, demoUser } from '@/services/demoData'
import type { Role, Shop, UserProfile } from '@/types'
import type { ShopFormValues } from '@/schemas'

interface AuthContextValue {
  user: UserProfile | null
  shop: Shop | null
  loading: boolean
  demo: boolean
  apiConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
  enterDemo: (role?: Role) => void
  createShop: (values: ShopFormValues) => Promise<void>
  updateShop: (patch: Partial<Shop>, shopId?: string) => Promise<void>
  updateAccount: (name: string) => Promise<void>
}

interface AuthResponse {
  accessToken: string
  user: UserProfile
}

interface ProfileResponse {
  user: UserProfile
  shop: Shop | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)

  const loadProfile = async () => {
    const profile = await api.get<ProfileResponse>('/auth/me')
    setUser(profile.user)
    setShop(profile.shop)
  }

  useEffect(() => {
    let active = true
    api.get<ProfileResponse>('/auth/me')
      .then((profile) => {
        if (!active) return
        setUser(profile.user)
        setShop(profile.shop)
      })
      .catch((error: unknown) => {
        if (error instanceof Error && 'status' in error && error.status !== 401) {
          console.error('Could not restore the API session', error)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const value: AuthContextValue = {
    user, shop, loading, demo, apiConfigured,
    signIn: async (email, password) => {
      const result = await api.post<AuthResponse>('/auth/login', { email, password })
      setAccessToken(result.accessToken)
      setUser(result.user)
      setShop(null)
      await loadProfile()
    },
    signUp: async (name, email, password) => {
      const result = await api.post<AuthResponse>('/auth/register', { name, email, password })
      setAccessToken(result.accessToken)
      setUser(result.user)
      setShop(null)
    },
    resetPassword: async (email) => {
      await api.post('/auth/forgot-password', { email })
    },
    logout: async () => {
      if (demo) {
        setUser(null)
        setShop(null)
        setDemo(false)
        return
      }
      try {
        await api.post('/auth/logout')
      } finally {
        setAccessToken(null)
        setUser(null)
        setShop(null)
      }
    },
    enterDemo: (role = 'owner') => {
      setAccessToken(null)
      setDemo(true)
      setUser({ ...demoUser, role })
      setShop(demoShop)
      setLoading(false)
    },
    createShop: async (values) => {
      if (demo) return
      await api.post('/shops', values)
      await loadProfile()
    },
    updateShop: async (patch, shopId) => {
      const targetId = shopId ?? shop?.id
      if (!targetId) return
      if (demo) {
        if (shop && targetId === shop.id) setShop({ ...shop, ...patch })
        return
      }
      const updated = await api.patch<Shop>(`/shops/${targetId}`, patch)
      if (shop && targetId === shop.id) setShop(updated)
    },
    updateAccount: async (name) => {
      if (!user) return
      if (demo) {
        setUser({ ...user, name })
        return
      }
      const result = await api.patch<{ user: UserProfile }>('/auth/me', { name })
      setUser(result.user)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
