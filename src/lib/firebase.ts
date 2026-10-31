import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

function hasRealFirebaseValue(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim()
  if (!normalized) return false
  if (/(^your[_-]|^example$|^replace[_-]|placeholder|demo|test)/i.test(normalized)) return false
  return true
}

const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const
export const isFirebaseConfigured = requiredFields.every((field) => hasRealFirebaseValue(config[field]))
let services: { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions } | null = null

export function firebaseServices() {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured. Add valid VITE_FIREBASE_* values to .env or use the demo workspace.')
  if (!services) {
    const app = initializeApp(config)
    services = { app, auth: getAuth(app), db: getFirestore(app), functions: getFunctions(app, 'asia-south1') }
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      connectAuthEmulator(services.auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      connectFirestoreEmulator(services.db, '127.0.0.1', 8080)
      connectFunctionsEmulator(services.functions, '127.0.0.1', 5001)
    }
  }
  return services
}
