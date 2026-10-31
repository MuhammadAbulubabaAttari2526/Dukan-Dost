import { describe, expect, it } from 'vitest'
import { calculateTotals, discountLimit, snapshotItems, type ProductSnapshot } from '../../functions/src/domain'

const product: ProductSnapshot = { id: 'p1', name: 'Tea', sku: 'T1', unit: 'pack', price: 150, cost: 110, stock: 5, archived: false }

describe('trusted function domain', () => {
  it('recalculates totals from authoritative snapshots', () => {
    const items = snapshotItems([product], [{ productId: 'p1', quantity: 2 }])
    expect(items[0]).toMatchObject({ unitPrice: 150, cost: 110, quantity: 2 })
    expect(calculateTotals(items, 20, 100)).toMatchObject({ subtotal: 300, total: 280, balanceDue: 180 })
  })
  it('merges repeated lines before validating stock', () => {
    expect(snapshotItems([product], [{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 3 }])[0].quantity).toBe(5)
    expect(() => snapshotItems([product], [{ productId: 'p1', quantity: 3 }, { productId: 'p1', quantity: 3 }])).toThrow()
  })
  it('enforces server role discount limits', () => {
    expect(discountLimit('cashier')).toBe(0.05)
    expect(discountLimit('owner')).toBe(1)
  })
})
