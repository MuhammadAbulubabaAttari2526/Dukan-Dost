export type Role = 'owner' | 'manager' | 'cashier' | 'super_admin' | 'unassigned'
export type PaymentMethod = 'cash' | 'digital' | 'credit'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled'

export interface Shop {
  id: string
  name: string
  contact: string
  address: string
  logoUrl?: string
  status: 'active' | 'suspended'
  plan: 'starter' | 'business'
  subscriptionStatus: SubscriptionStatus
  renewalDate: string
  createdAt: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
  shopId?: string
  role: Role
}

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  unit: string
  cost: number
  price: number
  stock: number
  lowStockThreshold: number
  supplierId?: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface SaleItem {
  id: string
  productId: string
  name: string
  sku: string
  unit: string
  unitPrice: number
  cost: number
  quantity: number
}

export interface Sale {
  id: string
  receiptNumber: string
  items: SaleItem[]
  subtotal: number
  discount: number
  total: number
  amountPaid: number
  balanceDue: number
  paymentMethod: PaymentMethod
  customerId?: string
  customerName?: string
  status: 'completed' | 'returned' | 'cancelled'
  createdAt: string
  createdBy: string
  idempotencyKey: string
}

export interface Customer {
  id: string
  name: string
  phone?: string
  createdAt: string
}

export interface LedgerEntry {
  id: string
  customerId: string
  type: 'credit_sale' | 'payment' | 'return' | 'adjustment'
  amount: number
  referenceId?: string
  note: string
  createdAt: string
}

export interface Payment {
  id: string
  customerId?: string
  saleId?: string
  amount: number
  method: Exclude<PaymentMethod, 'credit'>
  type: 'sale' | 'credit_payment' | 'refund'
  idempotencyKey: string
  createdAt: string
}

export interface Supplier {
  id: string
  name: string
  contact: string
  phone: string
}

export interface PurchaseItem {
  productId: string
  name: string
  quantity: number
  unitCost: number
}

export interface Purchase {
  id: string
  supplierId: string
  supplierName: string
  invoiceNumber: string
  items: PurchaseItem[]
  total: number
  status: 'draft' | 'confirmed' | 'cancelled'
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  createdAt: string
  confirmedAt?: string
}

export interface Expense {
  id: string
  title: string
  category: string
  amount: number
  date: string
  paymentMethod: Exclude<PaymentMethod, 'credit'>
  note?: string
}

export interface StockMovement {
  id: string
  productId: string
  productName: string
  type: 'opening' | 'purchase' | 'sale' | 'adjustment' | 'return'
  quantity: number
  reason: string
  referenceId?: string
  createdAt: string
}

export interface AuditLog {
  id: string
  action: string
  actor: string
  detail: string
  createdAt: string
}

export interface SubscriptionRecord {
  id: string
  plan: 'starter' | 'business'
  status: SubscriptionStatus
  startDate: string
  renewalDate: string
  note: string
}

export interface ShopData {
  products: Product[]
  sales: Sale[]
  customers: Customer[]
  ledger: LedgerEntry[]
  payments: Payment[]
  suppliers: Supplier[]
  purchases: Purchase[]
  expenses: Expense[]
  stockMovements: StockMovement[]
  auditLogs: AuditLog[]
  subscriptions: SubscriptionRecord[]
}

export interface SaleInput {
  items: Array<{ productId: string; quantity: number }>
  discount: number
  paymentMethod: PaymentMethod
  amountPaid: number
  customerId?: string
  idempotencyKey: string
}

export interface ProductInput {
  name: string
  sku: string
  category: string
  unit: string
  cost: number
  price: number
  stock: number
  lowStockThreshold: number
  supplierId?: string
}
