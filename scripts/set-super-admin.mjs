import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const uid = process.env.SUPER_ADMIN_UID
if (!uid || process.env.CONFIRM_SUPER_ADMIN !== 'true') {
  console.error('Set SUPER_ADMIN_UID and CONFIRM_SUPER_ADMIN=true. Run only with trusted Admin SDK credentials.')
  process.exit(1)
}
initializeApp({ credential: applicationDefault() })
const auth = getAuth()
const user = await auth.getUser(uid)
await auth.setCustomUserClaims(uid, { ...user.customClaims, superAdmin: true })
console.log(`Super-admin claim set for ${user.email ?? uid}. The user must sign out and sign in again.`)
