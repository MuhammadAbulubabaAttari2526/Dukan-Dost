/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/app/AuthContext'
import { createDemoData } from '@/services/demoData'
import { confirmDemoPurchase, createDemoSale, recordDemoPayment, returnDemoSale } from '@/services/demoOperations'
import type { Customer, Expense, Product, ProductInput, Sale, SaleInput, ShopData, Supplier } from '@/types'
import { roundMoney } from '@/utils/business'
import { uid } from '@/utils/format'
import { toast } from 'sonner'

interface DataContextValue {
  data: ShopData
  loading: boolean
  saveProduct: (input: ProductInput, id?: string) => Promise<void>
  importProducts: (rows: ProductInput[]) => Promise<void>
  archiveProduct: (id: string) => Promise<void>
  adjustStock: (id: string, quantity: number, reason: string) => Promise<void>
  createSale: (input: SaleInput) => Promise<Sale>
  returnSale: (id: string) => Promise<void>
  addCustomer: (input: Pick<Customer, 'name' | 'phone'>) => Promise<void>
  recordPayment: (customerId: string, amount: number, method: 'cash' | 'digital', key: string) => Promise<void>
  addSupplier: (input: Omit<Supplier, 'id'>) => Promise<void>
  createPurchase: (input: { supplierId: string; invoiceNumber: string; items: Array<{ productId: string; quantity: number; unitCost: number }> }) => Promise<void>
  confirmPurchase: (id: string) => Promise<void>
  addExpense: (input: Omit<Expense, 'id'>) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)
const emptyData: ShopData = { products: [], sales: [], customers: [], ledger: [], payments: [], suppliers: [], purchases: [], expenses: [], stockMovements: [], auditLogs: [], subscriptions: [] }

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, shop, demo } = useAuth()
  const queryClient = useQueryClient()
  const [demoData, setDemoData] = useState(createDemoData)
  const shopId = shop?.id
  const dataQuery = useQuery({
    queryKey: ['shop-data', shopId, user?.id],
    queryFn: () => api.get<Partial<ShopData>>(`/shops/${shopId}/bootstrap?limit=100`),
    enabled: !demo && Boolean(shopId && user),
    staleTime: 15_000,
  })
  const data: ShopData = demo ? demoData : { ...emptyData, ...(dataQuery.data ?? {}) }
  const loading = demo ? false : dataQuery.isLoading

  const invalidate = async () => {
    if (shopId) await queryClient.invalidateQueries({ queryKey: ['shop-data', shopId] })
  }
  const requireShopPath = () => {
    if (!shopId) throw new Error('A shop workspace is required for this operation')
    return `/shops/${shopId}`
  }
  const audit = (action: string, detail: string) => ({
    id: uid('audit'), action, actor: user?.name ?? 'Demo user', detail, createdAt: new Date().toISOString(),
  })

  const actions: DataContextValue = {
    data,
    loading,
    saveProduct: async (input, id) => {
      if (demo) {
        setDemoData((current) => {
          if (current.products.some((product) => product.sku.toLowerCase() === input.sku.toLowerCase() && product.id !== id)) throw new Error('This SKU already exists')
          const now = new Date().toISOString()
          if (id) {
            return { ...current, products: current.products.map((product) => product.id === id ? { ...product, ...input, stock: product.stock, updatedAt: now } : product), auditLogs: [audit('product.updated', `Updated ${input.name}`), ...current.auditLogs] }
          }
          const product: Product = { ...input, id: uid('prod'), archived: false, createdAt: now, updatedAt: now }
          const movement = input.stock ? [{ id: uid('move'), productId: product.id, productName: product.name, type: 'opening' as const, quantity: input.stock, reason: 'Opening stock', createdAt: now }] : []
          return { ...current, products: [product, ...current.products], stockMovements: [...movement, ...current.stockMovements], auditLogs: [audit('product.created', `Created ${input.name}`), ...current.auditLogs] }
        })
        return
      }
      const path = `${requireShopPath()}/products${id ? `/${id}` : ''}`
      if (id) {
        const patch = {
          name: input.name,
          sku: input.sku,
          category: input.category,
          unit: input.unit,
          cost: input.cost,
          price: input.price,
          lowStockThreshold: input.lowStockThreshold,
          supplierId: input.supplierId,
        }
        await api.patch(path, patch)
      } else {
        await api.post(path, input)
      }
      await invalidate()
    },
    importProducts: async (rows) => {
      if (!rows.length) throw new Error('No valid products to import')
      if (demo) {
        for (const row of rows) await actions.saveProduct(row)
        return
      }
      await api.post(`${requireShopPath()}/products/import`, { rows })
      await invalidate()
    },
    archiveProduct: async (id) => {
      if (demo) {
        setDemoData((current) => ({ ...current, products: current.products.map((product) => product.id === id ? { ...product, archived: true, updatedAt: new Date().toISOString() } : product), auditLogs: [audit('product.archived', `Archived product ${id}`), ...current.auditLogs] }))
        return
      }
      await api.post(`${requireShopPath()}/products/${id}/archive`)
      await invalidate()
    },
    adjustStock: async (id, quantity, reason) => {
      if (demo) {
        setDemoData((current) => {
          const product = current.products.find((item) => item.id === id)
          if (!product) throw new Error('Product not found')
          if (product.stock + quantity < 0) throw new Error('Stock cannot become negative')
          const movement = { id: uid('move'), productId: id, productName: product.name, type: 'adjustment' as const, quantity, reason, createdAt: new Date().toISOString() }
          return { ...current, products: current.products.map((item) => item.id === id ? { ...item, stock: item.stock + quantity, updatedAt: movement.createdAt } : item), stockMovements: [movement, ...current.stockMovements], auditLogs: [audit('stock.adjusted', `${product.name}: ${quantity > 0 ? '+' : ''}${quantity} — ${reason}`), ...current.auditLogs] }
        })
        return
      }
      await api.post(`${requireShopPath()}/products/${id}/adjustments`, { quantity, reason })
      await invalidate()
    },
    createSale: async (input) => {
      if (!demo) {
        const { idempotencyKey, ...body } = input
        const result = await api.post<Sale>(`${requireShopPath()}/sales`, body, { idempotencyKey })
        await invalidate()
        return result
      }
      const result = createDemoSale(data, input, user?.role ?? 'cashier', user?.name ?? 'Demo user')
      setDemoData(result.data)
      return result.sale
    },
    returnSale: async (id) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/sales/${id}/returns`, { reason: 'Full sale return', refundMethod: 'cash' }, { idempotencyKey: uid('return') })
        await invalidate()
        return
      }
      setDemoData((current) => returnDemoSale(current, id, user?.name ?? 'Demo user'))
    },
    addCustomer: async (input) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/customers`, input)
        await invalidate()
        return
      }
      setDemoData((current) => ({ ...current, customers: [{ ...input, id: uid('cust'), createdAt: new Date().toISOString() }, ...current.customers] }))
    },
    recordPayment: async (customerId, amount, method, key) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/customers/${customerId}/payments`, { amount, method }, { idempotencyKey: key })
        await invalidate()
        return
      }
      setDemoData((current) => recordDemoPayment(current, customerId, amount, method, key, user?.name ?? 'Demo user'))
    },
    addSupplier: async (input) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/suppliers`, input)
        await invalidate()
        return
      }
      setDemoData((current) => ({ ...current, suppliers: [{ ...input, id: uid('sup') }, ...current.suppliers] }))
    },
    createPurchase: async (input) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/purchases`, input)
        await invalidate()
        return
      }
      setDemoData((current) => {
        const supplier = current.suppliers.find((item) => item.id === input.supplierId)
        if (!supplier || !input.items.length) throw new Error('Supplier and at least one item are required')
        const items = input.items.map((item) => ({ ...item, name: current.products.find((product) => product.id === item.productId)?.name ?? 'Product' }))
        const purchase = { id: uid('po'), supplierId: supplier.id, supplierName: supplier.name, invoiceNumber: input.invoiceNumber, items, total: roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)), status: 'draft' as const, paymentStatus: 'unpaid' as const, createdAt: new Date().toISOString() }
        return { ...current, purchases: [purchase, ...current.purchases] }
      })
    },
    confirmPurchase: async (id) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/purchases/${id}/confirm`, {}, { idempotencyKey: uid('purchase-confirm') })
        await invalidate()
        return
      }
      setDemoData((current) => confirmDemoPurchase(current, id, user?.name ?? 'Demo user'))
    },
    addExpense: async (input) => {
      if (!demo) {
        await api.post(`${requireShopPath()}/expenses`, input)
        await invalidate()
        return
      }
      setDemoData((current) => ({ ...current, expenses: [{ ...input, id: uid('exp') }, ...current.expenses], auditLogs: [audit('expense.recorded', `${input.title} — PKR ${input.amount}`), ...current.auditLogs] }))
    },
  }

  useEffect(() => {
    if (dataQuery.error) toast.error('Could not load shop data')
  }, [dataQuery.error])
  return <DataContext.Provider value={actions}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside DataProvider')
  return context
}
