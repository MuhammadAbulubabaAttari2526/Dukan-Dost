import type { Role, Sale, SaleInput, ShopData } from '@/types'
import { buildSaleItems, calculateSaleTotals, customerBalance, discountLimit, roundMoney } from '@/utils/business'
import { uid } from '@/utils/format'

const audit = (data: ShopData, actor: string, action: string, detail: string, createdAt: string) => [{ id: uid('audit'), action, actor, detail, createdAt }, ...data.auditLogs]

export function createDemoSale(data: ShopData, input: SaleInput, role: Role, actor: string) {
  const duplicate = data.sales.find((sale) => sale.idempotencyKey === input.idempotencyKey)
  if (duplicate) return { data, sale: duplicate }
  const items = buildSaleItems(data.products, input.items)
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  if (input.discount > subtotal * discountLimit(role)) throw new Error('Discount exceeds your role limit')
  const totals = calculateSaleTotals(items, input.discount, input.amountPaid)
  if (input.paymentMethod === 'credit' && !input.customerId) throw new Error('Select a customer for a credit sale')
  if (totals.balanceDue > 0 && !input.customerId) throw new Error('An unpaid balance requires a customer')
  if (input.paymentMethod !== 'credit' && totals.balanceDue > 0) throw new Error('Cash and digital sales must be fully paid')
  const customer = data.customers.find((item) => item.id === input.customerId)
  const createdAt = new Date().toISOString()
  const id = uid('sale')
  const sale: Sale = { id, receiptNumber: `DD-${String(1050 + data.sales.length).padStart(5, '0')}`, items, ...totals, paymentMethod: input.paymentMethod, customerId: input.customerId, customerName: customer?.name, status: 'completed', createdAt, createdBy: actor, idempotencyKey: input.idempotencyKey }
  const movements = items.map((item) => ({ id: uid('move'), productId: item.productId, productName: item.name, type: 'sale' as const, quantity: -item.quantity, reason: `Sale ${sale.receiptNumber}`, referenceId: id, createdAt }))
  const ledger = totals.balanceDue > 0 && input.customerId ? [{ id: uid('ledger'), customerId: input.customerId, type: 'credit_sale' as const, amount: totals.balanceDue, referenceId: id, note: `Credit sale ${sale.receiptNumber}`, createdAt }] : []
  const payments = totals.amountPaid > 0 ? [{ id: uid('pay'), customerId: input.customerId, saleId: id, amount: totals.amountPaid, method: input.paymentMethod === 'digital' ? 'digital' as const : 'cash' as const, type: 'sale' as const, idempotencyKey: input.idempotencyKey, createdAt }] : []
  const next: ShopData = { ...data, sales: [sale, ...data.sales], products: data.products.map((product) => { const item = items.find((line) => line.productId === product.id); return item ? { ...product, stock: product.stock - item.quantity, updatedAt: createdAt } : product }), stockMovements: [...movements, ...data.stockMovements], ledger: [...ledger, ...data.ledger], payments: [...payments, ...data.payments] }
  return { data: { ...next, auditLogs: audit(next, actor, 'sale.completed', `${sale.receiptNumber} — PKR ${sale.total}`, createdAt) }, sale }
}

export function returnDemoSale(data: ShopData, id: string, actor: string) {
  const sale = data.sales.find((item) => item.id === id)
  if (!sale || sale.status !== 'completed') throw new Error('Only completed sales can be returned')
  const createdAt = new Date().toISOString()
  const movements = sale.items.map((item) => ({ id: uid('move'), productId: item.productId, productName: item.name, type: 'return' as const, quantity: item.quantity, reason: `Return ${sale.receiptNumber}`, referenceId: id, createdAt }))
  const ledger = sale.customerId && sale.balanceDue > 0 ? [{ id: uid('ledger'), customerId: sale.customerId, type: 'return' as const, amount: -sale.balanceDue, referenceId: id, note: `Return ${sale.receiptNumber}`, createdAt }] : []
  const refunds = sale.amountPaid > 0 ? [{ id: uid('refund'), customerId: sale.customerId, saleId: id, amount: sale.amountPaid, method: sale.paymentMethod === 'digital' ? 'digital' as const : 'cash' as const, type: 'refund' as const, idempotencyKey: `return_${id}`, createdAt }] : []
  const next: ShopData = { ...data, sales: data.sales.map((item) => item.id === id ? { ...item, status: 'returned' } : item), products: data.products.map((product) => { const item = sale.items.find((line) => line.productId === product.id); return item ? { ...product, stock: product.stock + item.quantity } : product }), stockMovements: [...movements, ...data.stockMovements], ledger: [...ledger, ...data.ledger], payments: [...refunds, ...data.payments] }
  return { ...next, auditLogs: audit(next, actor, 'sale.returned', `${sale.receiptNumber} returned and restocked`, createdAt) }
}

export function recordDemoPayment(data: ShopData, customerId: string, amount: number, method: 'cash' | 'digital', key: string, actor: string) {
  if (data.payments.some((payment) => payment.idempotencyKey === key)) return data
  if (amount <= 0 || amount > customerBalance(data, customerId)) throw new Error('Payment exceeds the outstanding balance')
  const createdAt = new Date().toISOString()
  const next: ShopData = { ...data, ledger: [{ id: uid('ledger'), customerId, type: 'payment', amount: -roundMoney(amount), referenceId: key, note: `${method} payment`, createdAt }, ...data.ledger], payments: [{ id: uid('pay'), customerId, amount, method, type: 'credit_payment', idempotencyKey: key, createdAt }, ...data.payments] }
  return { ...next, auditLogs: audit(next, actor, 'payment.recorded', `PKR ${amount} customer payment`, createdAt) }
}

export function confirmDemoPurchase(data: ShopData, id: string, actor: string) {
  const purchase = data.purchases.find((item) => item.id === id)
  if (!purchase || purchase.status !== 'draft') throw new Error('Purchase is already confirmed or unavailable')
  const createdAt = new Date().toISOString()
  const movements = purchase.items.map((item) => ({ id: uid('move'), productId: item.productId, productName: item.name, type: 'purchase' as const, quantity: item.quantity, reason: `Purchase ${purchase.invoiceNumber}`, referenceId: id, createdAt }))
  const next: ShopData = { ...data, purchases: data.purchases.map((item) => item.id === id ? { ...item, status: 'confirmed', confirmedAt: createdAt } : item), products: data.products.map((product) => { const item = purchase.items.find((line) => line.productId === product.id); return item ? { ...product, stock: product.stock + item.quantity, cost: item.unitCost } : product }), stockMovements: [...movements, ...data.stockMovements] }
  return { ...next, auditLogs: audit(next, actor, 'purchase.confirmed', `${purchase.invoiceNumber} stock-in completed`, createdAt) }
}
