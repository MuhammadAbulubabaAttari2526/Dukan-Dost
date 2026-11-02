import type { ClientSession, Db } from 'mongodb'

export async function inTransaction<T>(db: Db, work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = db.client.startSession()
  let result: T | undefined
  try {
    await session.withTransaction(async () => {
      result = await work(session)
      return result
    })
    if (result === undefined) throw new Error('Transaction completed without a result')
    return result
  } finally {
    await session.endSession()
  }
}
