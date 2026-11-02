import { ObjectId } from 'mongodb'

const moneyField = /(?:Paisa|PaisaTotal)$/
const idField = /(?:^_id$|Id)$/

export function serializeDocument(value: unknown): unknown {
  if (value instanceof ObjectId) return value.toHexString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeDocument)
  if (!value || typeof value !== 'object') return value

  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    if (key === '_id') {
      result.id = serializeDocument(nested)
    } else if (moneyField.test(key) && typeof nested === 'number') {
      result[key.replace(/Paisa(?:Total)?$/, '')] = nested / 100
    } else if (key === 'shopId' || idField.test(key)) {
      result[key] = serializeDocument(nested)
    } else {
      result[key] = serializeDocument(nested)
    }
  }
  return result
}
