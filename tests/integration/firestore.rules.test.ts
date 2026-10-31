import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, it } from 'vitest'
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
let testEnv: RulesTestEnvironment

describe.skipIf(!enabled)('Firestore tenant isolation and write boundaries', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'dukaan-dost-rules-test', firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'shops/shopA/members/userA'), { role: 'owner' })
      await setDoc(doc(context.firestore(), 'shops/shopA/products/p1'), { name: 'Tea', stock: 5 })
      await setDoc(doc(context.firestore(), 'shops/shopB/products/p2'), { name: 'Other shop secret', stock: 9 })
    })
  })
  afterAll(async () => { if (testEnv) await testEnv.cleanup() })

  it('allows an authenticated member to read their own shop', async () => {
    const db = testEnv.authenticatedContext('userA').firestore()
    await assertSucceeds(getDoc(doc(db, 'shops/shopA/products/p1')))
  })
  it('denies shop-to-shop reads and unauthenticated reads', async () => {
    const member = testEnv.authenticatedContext('userA').firestore()
    const anonymous = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(member, 'shops/shopB/products/p2')))
    await assertFails(getDoc(doc(anonymous, 'shops/shopA/products/p1')))
  })
  it('denies direct browser stock and sale writes', async () => {
    const db = testEnv.authenticatedContext('userA').firestore()
    await assertFails(updateDoc(doc(db, 'shops/shopA/products/p1'), { stock: 999 }))
    await assertFails(setDoc(doc(db, 'shops/shopA/sales/fake'), { total: 1 }))
  })
  it('permits unassigned public profiles but blocks role escalation', async () => {
    const db = testEnv.authenticatedContext('newUser').firestore()
    await assertSucceeds(setDoc(doc(db, 'users/newUser'), { name: 'New User', email: 'new@example.com', role: 'unassigned' }))
    await assertFails(setDoc(doc(db, 'users/otherUser'), { name: 'Attacker', email: 'a@example.com', role: 'unassigned' }))
    await assertFails(updateDoc(doc(db, 'users/newUser'), { role: 'owner' }))
  })
})
