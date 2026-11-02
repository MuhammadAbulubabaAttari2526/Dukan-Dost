import { connectDatabase, closeDatabase, createIndexes } from '../src/db/connection.js'

try {
  await createIndexes(await connectDatabase())
} finally {
  await closeDatabase()
}
