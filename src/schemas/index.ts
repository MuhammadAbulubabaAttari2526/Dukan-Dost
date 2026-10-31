import { z } from 'zod'

const money = z.coerce.number().finite().nonnegative().max(100_000_000)
const quantity = z.coerce.number().int().nonnegative().max(1_000_000)

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = loginSchema.extend({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
})

export const shopSchema = z.object({
  name: z.string().trim().min(2, 'Shop name is required').max(100),
  contact: z.string().trim().min(10, 'Enter a valid contact number').max(20),
  address: z.string().trim().min(5, 'Enter the shop address').max(240),
})

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(120),
  sku: z.string().trim().min(2, 'SKU or barcode is required').max(60),
  category: z.string().trim().min(2, 'Category is required').max(60),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  cost: money,
  price: money,
  stock: quantity,
  lowStockThreshold: quantity,
  supplierId: z.string().optional(),
})

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name is required').max(100),
  phone: z.string().trim().max(20).optional(),
})

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name is required').max(100),
  contact: z.string().trim().min(2, 'Contact person is required').max(100),
  phone: z.string().trim().min(10, 'Enter a valid phone number').max(20),
})

export const expenseSchema = z.object({
  title: z.string().trim().min(2, 'Expense title is required').max(120),
  category: z.string().trim().min(2, 'Select a category'),
  amount: money.refine((value) => value > 0, 'Amount must be greater than zero'),
  date: z.string().min(1, 'Date is required'),
  paymentMethod: z.enum(['cash', 'digital']),
  note: z.string().trim().max(300).optional(),
})

export const paymentSchema = z.object({
  amount: money.refine((value) => value > 0, 'Payment must be greater than zero'),
  method: z.enum(['cash', 'digital']),
  idempotencyKey: z.string().min(8),
})

export const adjustmentSchema = z.object({
  quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, 'Quantity cannot be zero'),
  reason: z.string().trim().min(3, 'A reason is required').max(240),
})

export type ProductFormValues = z.infer<typeof productSchema>
export type ShopFormValues = z.infer<typeof shopSchema>
