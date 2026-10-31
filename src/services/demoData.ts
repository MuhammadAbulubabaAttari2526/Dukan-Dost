import type { Product, Sale, SaleItem, Shop, ShopData, UserProfile } from '@/types'
import { calculateSaleTotals } from '@/utils/business'
import { toDateInput } from '@/utils/format'

const ago = (days: number, hour = 12) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 15, 0, 0)
  return date.toISOString()
}

export const demoShop: Shop = {
  id: 'demo_shop_karachi', name: 'Al-Madina General Store', contact: '+92 300 1234567',
  address: 'Shop 12, Block H, North Nazimabad, Karachi', status: 'active', plan: 'business',
  subscriptionStatus: 'trial', renewalDate: ago(-11), createdAt: ago(90),
}

export const demoUser: UserProfile = {
  id: 'demo_owner', name: 'Ahmed Raza', email: 'ahmed@almadina.pk', shopId: demoShop.id, role: 'owner',
}

const products: Product[] = [
  ['p1', 'Tapal Danedar Tea 950g', '8901030835019', 'Grocery', 'pack', 1320, 1480, 18, 8],
  ['p2', 'Dalda Cooking Oil 5L', '8901022101244', 'Grocery', 'bottle', 3440, 3790, 7, 5],
  ['p3', 'National Iodized Salt 800g', '8901030002017', 'Grocery', 'pack', 92, 120, 42, 15],
  ['p4', 'Everyday Milk Powder 900g', '8901030841017', 'Dairy', 'pack', 2480, 2690, 4, 6],
  ['p5', 'Coca-Cola 1.5L', '8901001012348', 'Beverages', 'bottle', 205, 250, 31, 12],
  ['p6', 'Dollar My Pencil', '8901234500123', 'Stationery', 'piece', 17, 25, 86, 24],
  ['p7', 'A4 Paper Ream 80gsm', '8901234501021', 'Stationery', 'ream', 1280, 1450, 9, 5],
  ['p8', 'Lifebuoy Soap 110g', '8901030688116', 'Personal care', 'piece', 168, 210, 22, 10],
].map(([id, name, sku, category, unit, cost, price, stock, lowStockThreshold]) => ({
  id: id as string, name: name as string, sku: sku as string, category: category as string,
  unit: unit as string, cost: cost as number, price: price as number, stock: stock as number,
  lowStockThreshold: lowStockThreshold as number, archived: false,
  createdAt: ago(80), updatedAt: ago(2),
}))

function demoSale(id: string, days: number, hour: number, lines: Array<[number, number]>, discount: number, method: Sale['paymentMethod'], customerId?: string): Sale {
  const items: SaleItem[] = lines.map(([productIndex, quantity]) => {
    const product = products[productIndex]
    return { id: `${id}_${product.id}`, productId: product.id, name: product.name, sku: product.sku, unit: product.unit, unitPrice: product.price, cost: product.cost, quantity }
  })
  const totals = calculateSaleTotals(items, discount, method === 'credit' ? 0 : 999999)
  const customer = customerId ? ['', 'Bismillah Traders', 'Sana Khan', 'Usman Stationers', 'Hassan Ali'][Number(customerId.replace('c', ''))] : undefined
  return {
    id, receiptNumber: `DD-${String(1040 + Number(id.replace('s', ''))).padStart(5, '0')}`,
    items, ...totals, paymentMethod: method, customerId, customerName: customer,
    status: 'completed', createdAt: ago(days, hour), createdBy: 'Ahmed Raza', idempotencyKey: `demo_${id}`,
  }
}

const sales = [
  demoSale('s1', 0, 9, [[0, 2], [4, 2]], 0, 'cash'),
  demoSale('s2', 0, 10, [[2, 3], [5, 12]], 25, 'digital'),
  demoSale('s3', 0, 11, [[1, 1], [7, 2]], 0, 'credit', 'c4'),
  demoSale('s4', 0, 13, [[6, 1], [5, 10]], 50, 'cash'),
  demoSale('s5', 1, 16, [[3, 1], [0, 1]], 0, 'digital'),
  demoSale('s6', 2, 12, [[4, 6], [2, 2]], 0, 'cash'),
  demoSale('s7', 4, 15, [[1, 2], [7, 4]], 100, 'credit', 'c1'),
  demoSale('s8', 6, 11, [[6, 2], [5, 20]], 0, 'cash'),
  demoSale('s9', 12, 14, [[0, 3], [3, 2]], 150, 'digital'),
  demoSale('s10', 18, 10, [[2, 10], [4, 8]], 0, 'cash'),
]

export function createDemoData(): ShopData {
  return {
    products: structuredClone(products),
    sales: structuredClone(sales),
    customers: [
      { id: 'c1', name: 'Bismillah Traders', phone: '+92 321 4567890', createdAt: ago(65) },
      { id: 'c2', name: 'Sana Khan', phone: '+92 333 2345678', createdAt: ago(48) },
      { id: 'c3', name: 'Usman Stationers', phone: '+92 300 9876543', createdAt: ago(35) },
      { id: 'c4', name: 'Hassan Ali', phone: '+92 312 7654321', createdAt: ago(20) },
    ],
    ledger: [
      { id: 'l1', customerId: 'c1', type: 'credit_sale', amount: 8320, referenceId: 's7', note: 'Credit sale DD-01047', createdAt: ago(4, 15) },
      { id: 'l2', customerId: 'c1', type: 'payment', amount: -3000, note: 'Partial cash payment', createdAt: ago(2, 10) },
      { id: 'l3', customerId: 'c2', type: 'credit_sale', amount: 3200, referenceId: 'old_1', note: 'Credit sale', createdAt: ago(9) },
      { id: 'l4', customerId: 'c2', type: 'payment', amount: -1200, note: 'Bank transfer', createdAt: ago(5) },
      { id: 'l5', customerId: 'c4', type: 'credit_sale', amount: 4210, referenceId: 's3', note: 'Credit sale DD-01043', createdAt: ago(0, 11) },
    ],
    payments: [
      { id: 'pay1', customerId: 'c1', amount: 3000, method: 'cash', type: 'credit_payment', idempotencyKey: 'demo_pay1', createdAt: ago(2, 10) },
      { id: 'pay2', customerId: 'c2', amount: 1200, method: 'digital', type: 'credit_payment', idempotencyKey: 'demo_pay2', createdAt: ago(5) },
    ],
    suppliers: [
      { id: 'sup1', name: 'Metro Distribution', contact: 'Kamran Ahmed', phone: '+92 321 1112233' },
      { id: 'sup2', name: 'Sindh Stationery House', contact: 'Nadeem Khan', phone: '+92 300 4445566' },
      { id: 'sup3', name: 'Pak Beverage Traders', contact: 'Ali Nawaz', phone: '+92 333 7778899' },
    ],
    purchases: [
      { id: 'po1', supplierId: 'sup1', supplierName: 'Metro Distribution', invoiceNumber: 'MD-8841', items: [{ productId: 'p1', name: 'Tapal Danedar Tea 950g', quantity: 12, unitCost: 1320 }, { productId: 'p3', name: 'National Iodized Salt 800g', quantity: 30, unitCost: 92 }], total: 18600, status: 'confirmed', paymentStatus: 'paid', createdAt: ago(7), confirmedAt: ago(7) },
      { id: 'po2', supplierId: 'sup2', supplierName: 'Sindh Stationery House', invoiceNumber: 'SSH-2290', items: [{ productId: 'p7', name: 'A4 Paper Ream 80gsm', quantity: 10, unitCost: 1280 }], total: 12800, status: 'draft', paymentStatus: 'unpaid', createdAt: ago(1) },
    ],
    expenses: [
      { id: 'e1', title: 'Shop electricity bill', category: 'Utilities', amount: 6850, date: toDateInput(new Date()), paymentMethod: 'digital', note: 'K-Electric' },
      { id: 'e2', title: 'Delivery rickshaw', category: 'Transport', amount: 850, date: toDateInput(new Date()), paymentMethod: 'cash' },
      { id: 'e3', title: 'Staff lunch', category: 'Staff', amount: 1200, date: toDateInput(new Date(Date.now() - 86400000)), paymentMethod: 'cash' },
      { id: 'e4', title: 'Monthly shop rent', category: 'Rent', amount: 28000, date: toDateInput(new Date(Date.now() - 6 * 86400000)), paymentMethod: 'digital' },
    ],
    stockMovements: [
      { id: 'm1', productId: 'p4', productName: 'Everyday Milk Powder 900g', type: 'sale', quantity: -1, reason: 'Sale DD-01045', referenceId: 's5', createdAt: ago(1, 16) },
      { id: 'm2', productId: 'p1', productName: 'Tapal Danedar Tea 950g', type: 'purchase', quantity: 12, reason: 'Purchase MD-8841', referenceId: 'po1', createdAt: ago(7) },
      { id: 'm3', productId: 'p7', productName: 'A4 Paper Ream 80gsm', type: 'adjustment', quantity: -1, reason: 'Damaged during storage', createdAt: ago(3) },
    ],
    auditLogs: [
      { id: 'a1', action: 'purchase.confirmed', actor: 'Ahmed Raza', detail: 'Purchase MD-8841 confirmed and stock updated', createdAt: ago(7) },
      { id: 'a2', action: 'payment.recorded', actor: 'Ahmed Raza', detail: 'PKR 3,000 received from Bismillah Traders', createdAt: ago(2, 10) },
    ],
    subscriptions: [
      { id: 'sub2', plan: 'business', status: 'trial', startDate: ago(3), renewalDate: ago(-11), note: '14-day Business trial; no payment collected' },
      { id: 'sub1', plan: 'starter', status: 'expired', startDate: ago(90), renewalDate: ago(60), note: 'Initial evaluation period ended' },
    ],
  }
}
