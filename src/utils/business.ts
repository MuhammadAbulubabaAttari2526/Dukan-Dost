import type { Product, Role, SaleInput, SaleItem, ShopData } from '@/types'

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function discountLimit(role: Role) {
  if (role === 'cashier') return 0.05
  if (role === 'manager') return 0.2
  return 1
}

export function calculateSaleTotals(items: SaleItem[], discount: number, amountPaid = 0) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))
  if (discount < 0 || discount > subtotal) throw new Error('Discount is outside the allowed range')
  const total = roundMoney(subtotal - discount)
  const paid = roundMoney(Math.max(0, amountPaid))
  return { subtotal, discount: roundMoney(discount), total, amountPaid: Math.min(paid, total), balanceDue: roundMoney(Math.max(0, total - paid)) }
}

export function buildSaleItems(products: Product[], input: SaleInput['items']) {
  if (!input.length) throw new Error('Add at least one product')
  return input.map((line) => {
    const product = products.find((item) => item.id === line.productId && !item.archived)
    if (!product) throw new Error('A selected product is no longer available')
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error('Quantities must be positive whole numbers')
    if (product.stock < line.quantity) throw new Error(`${product.name} has only ${product.stock} ${product.unit} in stock`)
    return {
      id: `${product.id}_${line.quantity}`,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      unitPrice: product.price,
      cost: product.cost,
      quantity: line.quantity,
    }
  })
}

export function customerBalance(data: ShopData, customerId: string) {
  return roundMoney(data.ledger.filter((entry) => entry.customerId === customerId)
    .reduce((sum, entry) => sum + entry.amount, 0))
}

export function metricsForRange(data: ShopData, from: Date, to: Date) {
  const sales = data.sales.filter((sale) => {
    const date = new Date(sale.createdAt)
    return date >= from && date <= to && sale.status === 'completed'
  })
  const returned = data.sales.filter((sale) => {
    const date = new Date(sale.createdAt)
    return date >= from && date <= to && sale.status === 'returned'
  })
  const netSales = roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0) - returned.reduce((sum, sale) => sum + sale.total, 0))
  const cogs = roundMoney(sales.reduce((sum, sale) => sum + sale.items.reduce((value, item) => value + item.cost * item.quantity, 0), 0)
    - returned.reduce((sum, sale) => sum + sale.items.reduce((value, item) => value + item.cost * item.quantity, 0), 0))
  const expenses = roundMoney(data.expenses.filter((expense) => {
    const date = new Date(`${expense.date}T12:00:00+05:00`)
    return date >= from && date <= to
  }).reduce((sum, expense) => sum + expense.amount, 0))
  const grossProfit = roundMoney(netSales - cogs)
  return {
    netSales,
    transactions: sales.length,
    cogs,
    grossProfit,
    expenses,
    operatingResult: roundMoney(grossProfit - expenses),
    sales,
  }
}

export function startOfPakistanDay(offset = 0) {
  const now = new Date()
  const karachi = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }))
  karachi.setDate(karachi.getDate() + offset)
  karachi.setHours(0, 0, 0, 0)
  return new Date(karachi.getTime() - 5 * 60 * 60 * 1000)
}

export function bestSelling(data: ShopData, limit = 5) {
  const totals = new Map<string, { name: string; quantity: number; revenue: number }>()
  data.sales.filter((sale) => sale.status === 'completed').forEach((sale) => sale.items.forEach((item) => {
    const current = totals.get(item.productId) ?? { name: item.name, quantity: 0, revenue: 0 }
    current.quantity += item.quantity
    current.revenue += item.unitPrice * item.quantity
    totals.set(item.productId, current)
  }))
  return [...totals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit)
}
