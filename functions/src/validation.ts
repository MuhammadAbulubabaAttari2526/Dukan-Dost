import { z } from 'zod'

export const shopId = z.string().min(3).max(128)
export const money = z.number().finite().nonnegative().max(100_000_000)
export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(60),
  category: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(1).max(20),
  cost: money,
  price: money,
  stock: z.number().int().nonnegative().max(1_000_000),
  lowStockThreshold: z.number().int().nonnegative().max(1_000_000),
  supplierId: z.string().max(128).optional(),
})
export const saleSchema = z.object({
  shopId,
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(1_000_000) })).min(1).max(100),
  discount: money,
  paymentMethod: z.enum(['cash', 'digital', 'credit']),
  amountPaid: money,
  customerId: z.string().max(128).optional(),
  idempotencyKey: z.string().min(8).max(128),
})
export const paymentSchema = z.object({
  shopId,
  customerId: z.string().min(1).max(128),
  amount: money.positive(),
  method: z.enum(['cash', 'digital']),
  idempotencyKey: z.string().min(8).max(128),
})
export const customerSchema = z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().max(20).optional() })
export const supplierSchema = z.object({ name: z.string().trim().min(2).max(100), contact: z.string().trim().min(2).max(100), phone: z.string().trim().min(10).max(20) })
export const expenseSchema = z.object({
  title: z.string().trim().min(2).max(120), category: z.string().trim().min(2).max(60),
  amount: money.positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(['cash', 'digital']), note: z.string().trim().max(300).optional(),
})
export const purchaseSchema = z.object({
  supplierId: z.string().min(1), invoiceNumber: z.string().trim().min(2).max(80),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(1_000_000), unitCost: money })).min(1).max(100),
})
