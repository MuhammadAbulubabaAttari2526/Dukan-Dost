import { describe, expect, it } from 'vitest'
import { can } from '@/lib/permissions'
import { canWriteBusiness } from '@/lib/accessPolicy'
import { productSchema } from '@/schemas'
import { createDemoData, demoShop } from '@/services/demoData'
import { confirmDemoPurchase, createDemoSale, recordDemoPayment, returnDemoSale } from '@/services/demoOperations'
import { buildSaleItems, calculateSaleTotals, customerBalance, discountLimit, metricsForRange } from '@/utils/business'
import { parseCsv } from '@/utils/csv'

const cashSale = (key = 'test_sale_1') => ({ items: [{ productId: 'p1', quantity: 2 }], discount: 0, paymentMethod: 'cash' as const, amountPaid: 2960, idempotencyKey: key })

describe('authorization and subscription access', () => {
  it('limits cashier access and discount authority', () => {
    expect(can('cashier', 'pos')).toBe(true)
    expect(can('cashier', 'products')).toBe(false)
    expect(can('cashier', 'admin')).toBe(false)
    expect(can('super_admin', 'admin')).toBe(true)
    expect(discountLimit('cashier')).toBe(0.05)
    expect(discountLimit('manager')).toBe(0.2)
  })
  it('preserves expired data access while blocking business writes', () => {
    expect(canWriteBusiness({ ...demoShop, subscriptionStatus: 'expired' })).toBe(false)
    expect(canWriteBusiness({ ...demoShop, status: 'suspended' })).toBe(false)
    expect(canWriteBusiness({ ...demoShop, subscriptionStatus: 'active', renewalDate: new Date(Date.now() + 86400000).toISOString() })).toBe(true)
  })
})

describe('product and CSV validation', () => {
  it('validates and coerces product rows', () => {
    const result = productSchema.safeParse({ name: 'Tea', sku: 'TEA-1', category: 'Grocery', unit: 'pack', cost: '100', price: '120', stock: '5', lowStockThreshold: '2' })
    expect(result.success).toBe(true)
    expect(productSchema.safeParse({ name: 'T', sku: '', category: '', unit: '', cost: -1, price: -2, stock: -3, lowStockThreshold: 0 }).success).toBe(false)
  })
  it('parses quoted CSV and rejects malformed data', () => {
    expect(parseCsv('name,sku\n"Tea, large","TEA-1"')[0].name).toBe('Tea, large')
    expect(() => parseCsv('name,sku\n"Unclosed,TEA')).toThrow()
    expect(() => parseCsv('name,sku')).toThrow()
  })
})

describe('sale calculations, stock and idempotency', () => {
  it('calculates subtotal, discount, paid and balance', () => {
    expect(calculateSaleTotals([{ id: 'i', productId: 'p', name: 'Tea', sku: 'T', unit: 'pack', unitPrice: 100, cost: 80, quantity: 3 }], 25, 200)).toEqual({ subtotal: 300, discount: 25, total: 275, amountPaid: 200, balanceDue: 75 })
    expect(() => calculateSaleTotals([], -1)).toThrow()
  })
  it('uses product price and cost snapshots and blocks negative stock', () => {
    const data = createDemoData()
    const items = buildSaleItems(data.products, [{ productId: 'p1', quantity: 2 }])
    expect(items[0].unitPrice).toBe(data.products[0].price)
    expect(items[0].cost).toBe(data.products[0].cost)
    expect(() => buildSaleItems(data.products, [{ productId: 'p1', quantity: 999 }])).toThrow(/insufficient|only/i)
  })
  it('deducts stock once when an idempotency key is retried', () => {
    const initial = createDemoData()
    const stock = initial.products.find((product) => product.id === 'p1')!.stock
    const first = createDemoSale(initial, cashSale(), 'owner', 'Tester')
    const second = createDemoSale(first.data, cashSale(), 'owner', 'Tester')
    expect(second.sale.id).toBe(first.sale.id)
    expect(second.data.products.find((product) => product.id === 'p1')!.stock).toBe(stock - 2)
    expect(second.data.stockMovements.filter((movement) => movement.referenceId === first.sale.id)).toHaveLength(1)
  })
  it('enforces cashier discount limits and credit customer rules', () => {
    const data = createDemoData()
    expect(() => createDemoSale(data, { ...cashSale('discount_test'), discount: 500 }, 'cashier', 'Cashier')).toThrow(/discount/i)
    expect(() => createDemoSale(data, { ...cashSale('credit_test'), paymentMethod: 'credit', amountPaid: 0 }, 'owner', 'Owner')).toThrow(/customer/i)
  })
})

describe('credit, returns and purchasing', () => {
  it('supports partial customer payments and blocks duplicates', () => {
    const initial = createDemoData()
    const before = customerBalance(initial, 'c1')
    const paid = recordDemoPayment(initial, 'c1', 1000, 'cash', 'payment_test_key', 'Tester')
    const retried = recordDemoPayment(paid, 'c1', 1000, 'cash', 'payment_test_key', 'Tester')
    expect(customerBalance(retried, 'c1')).toBe(before - 1000)
    expect(retried.payments.filter((payment) => payment.idempotencyKey === 'payment_test_key')).toHaveLength(1)
    expect(() => recordDemoPayment(retried, 'c1', 999999, 'cash', 'payment_over', 'Tester')).toThrow()
  })
  it('restocks a returned sale and reverses outstanding credit', () => {
    const initial = createDemoData()
    const credit = createDemoSale(initial, { ...cashSale('return_credit'), paymentMethod: 'credit', amountPaid: 0, customerId: 'c1' }, 'owner', 'Tester')
    const before = customerBalance(credit.data, 'c1')
    const returned = returnDemoSale(credit.data, credit.sale.id, 'Tester')
    expect(returned.sales.find((sale) => sale.id === credit.sale.id)!.status).toBe('returned')
    expect(customerBalance(returned, 'c1')).toBe(before - credit.sale.balanceDue)
    expect(returned.products.find((product) => product.id === 'p1')!.stock).toBe(initial.products.find((product) => product.id === 'p1')!.stock)
  })
  it('stocks in a confirmed purchase exactly once', () => {
    const initial = createDemoData()
    const stock = initial.products.find((product) => product.id === 'p7')!.stock
    const confirmed = confirmDemoPurchase(initial, 'po2', 'Tester')
    expect(confirmed.products.find((product) => product.id === 'p7')!.stock).toBe(stock + 10)
    expect(() => confirmDemoPurchase(confirmed, 'po2', 'Tester')).toThrow(/already/i)
  })
  it('separates revenue, COGS, gross profit and operating result', () => {
    const data = createDemoData()
    const metrics = metricsForRange(data, new Date(Date.now() - 86400000), new Date(Date.now() + 86400000))
    expect(metrics.grossProfit).toBe(metrics.netSales - metrics.cogs)
    expect(metrics.operatingResult).toBe(metrics.grossProfit - metrics.expenses)
    expect(metrics.netSales).toBeGreaterThan(0)
  })
})
