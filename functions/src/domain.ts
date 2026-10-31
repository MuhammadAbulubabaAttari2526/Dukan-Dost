export type Role = 'owner' | 'manager' | 'cashier'
export interface SaleLine { productId: string; quantity: number }
export interface ProductSnapshot { id: string; name: string; sku: string; unit: string; price: number; cost: number; stock: number; archived: boolean }

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const discountLimit = (role: Role) => role === 'cashier' ? 0.05 : role === 'manager' ? 0.2 : 1

export function calculateTotals(lines: Array<{ unitPrice: number; quantity: number }>, discount: number, amountPaid: number) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new Error('Invalid discount')
  const total = roundMoney(subtotal - discount)
  const paid = roundMoney(Math.min(Math.max(0, amountPaid), total))
  return { subtotal, discount: roundMoney(discount), total, amountPaid: paid, balanceDue: roundMoney(total - paid) }
}

export function snapshotItems(products: ProductSnapshot[], lines: SaleLine[]) {
  if (!lines.length || lines.length > 100) throw new Error('A sale must contain 1–100 lines')
  const merged = new Map<string, number>()
  lines.forEach((line) => merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity))
  return [...merged.entries()].map(([productId, quantity]) => {
    const product = products.find((item) => item.id === productId)
    if (!product || product.archived) throw new Error('A selected product is unavailable')
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Invalid quantity')
    if (product.stock < quantity) throw new Error(`${product.name} has insufficient stock`)
    return { id: `${productId}_${quantity}`, productId, name: product.name, sku: product.sku, unit: product.unit, unitPrice: product.price, cost: product.cost, quantity }
  })
}
