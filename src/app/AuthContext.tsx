/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { firebaseServices, isFirebaseConfigured } from '@/lib/firebase'
import { demoShop, demoUser } from '@/services/demoData'
import type { Role, Shop, UserProfile } from '@/types'
import type { ShopFormValues } from '@/schemas'

interface AuthContextValue {
  user: UserProfile | null
  shop: Shop | null
  loading: boolean
  demo: boolean
  firebaseConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
  enterDemo: (role?: Role) => void
  createShop: (values: ShopFormValues) => Promise<void>
  updateShop: (patch: Partial<Shop>, shopId?: string) => Promise<void>
  updateAccount: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function normalize<T>(id: string, document: Record<string, unknown>): T {
  return { id, ...Object.fromEntries(Object.entries(document).map(([key, value]) => [key, value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value])) } as T
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [demo, setDemo] = useState(false)

  const loadProfile = useCallback(async (uid: string) => {
    const { db } = firebaseServices()
    const snapshot = await getDoc(doc(db, 'users', uid))
    if (!snapshot.exists()) {
      setUser(null)
      setShop(null)
      return
    }
    const profile = normalize<UserProfile>(snapshot.id, snapshot.data())
    setUser(profile)
    if (profile.shopId) {
      const shopSnapshot = await getDoc(doc(db, 'shops', profile.shopId))
      setShop(shopSnapshot.exists() ? normalize<Shop>(shopSnapshot.id, shopSnapshot.data()) : null)
    } else setShop(null)
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured || demo) {
      setLoading(false)
      return
    }
    const { auth } = firebaseServices()
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      try {
        if (firebaseUser) await loadProfile(firebaseUser.uid)
        else { setUser(null); setShop(null) }
      } finally { setLoading(false) }
    })
  }, [demo, loadProfile])

  const value: AuthContextValue = {
    user, shop, loading, demo, firebaseConfigured: isFirebaseConfigured,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(firebaseServices().auth, email, password)
    },
    signUp: async (name, email, password) => {
      const { auth, db } = firebaseServices()
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(credential.user, { displayName: name })
      await setDoc(doc(db, 'users', credential.user.uid), {
        name, email, role: 'unassigned', createdAt: serverTimestamp(),
      })
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(firebaseServices().auth, email)
    },
    logout: async () => {
      if (demo) { setUser(null); setShop(null); setDemo(false) }
      else await signOut(firebaseServices().auth)
    },
    enterDemo: (role = 'owner') => {
      setDemo(true)
      setUser({ ...demoUser, role })
      setShop(demoShop)
      setLoading(false)
    },
    createShop: async (values) => {
      if (demo) return
      const callable = httpsCallable<ShopFormValues, { shopId: string }>(firebaseServices().functions, 'createShop')
      await callable(values)
      if (user) await loadProfile(user.id)
    },
    updateShop: async (patch, shopId) => {
      if (!shop) return
      const targetId = shopId ?? shop.id
      if (demo) { if (targetId === shop.id) setShop({ ...shop, ...patch }) }
      else {
        const adminFields = ['status', 'plan', 'subscriptionStatus', 'renewalDate']
        const functionName = Object.keys(patch).some((key) => adminFields.includes(key)) ? 'updateShopAdmin' : 'updateShopProfile'
        const callable = httpsCallable(firebaseServices().functions, functionName)
        await callable({ shopId: targetId, ...patch })
        if (targetId === shop.id) setShop({ ...shop, ...patch })
      }
    },
    updateAccount: async (name) => {
      if (!user) return
      if (demo) setUser({ ...user, name })
      else {
        const { auth, db } = firebaseServices()
        if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name })
        await setDoc(doc(db, 'users', user.id), { name }, { merge: true })
        setUser({ ...user, name })
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
