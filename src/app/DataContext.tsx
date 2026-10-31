/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { collection, limit, onSnapshot, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '@/app/AuthContext'
import { firebaseServices } from '@/lib/firebase'
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
const collections = ['products', 'sales', 'customers', 'ledger', 'payments', 'suppliers', 'purchases', 'expenses', 'stockMovements', 'auditLogs', 'subscriptions'] as const

function normalizeDocument(document: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(document).map(([key, value]) => {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return [key, value.toDate().toISOString()]
    return [key, value]
  }))
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, shop, demo } = useAuth()
  const shopId = shop?.id
  const userId = user?.id
  const [data, setData] = useState<ShopData>(demo ? createDemoData() : emptyData)
  const [loading, setLoading] = useState(!demo)

  useEffect(() => {
    if (demo) { setData(createDemoData()); setLoading(false); return }
    if (!shopId || !userId) { setData(emptyData); setLoading(false); return }
    setLoading(true)
    const { db } = firebaseServices()
    let active = true
    const unsubscribers = collections.map((name) => onSnapshot(
      query(collection(db, 'shops', shopId, name), limit(500)),
      (snapshot) => {
        if (!active) return
        setData((current) => ({ ...current, [name]: snapshot.docs.map((item) => ({ id: item.id, ...normalizeDocument(item.data()) })) }))
        setLoading(false)
      },
      (error) => { console.error(error); toast.error(`Could not load ${name}`); setLoading(false) },
    ))
    return () => { active = false; unsubscribers.forEach((unsubscribe) => unsubscribe()) }
  }, [demo, shopId, userId])

  const call = async <T,>(name: string, payload: unknown): Promise<T> => {
    const callable = httpsCallable<unknown, T>(firebaseServices().functions, name)
    const result = await callable(payload)
    return result.data
  }

  const audit = (action: string, detail: string) => ({
    id: uid('audit'), action, actor: user?.name ?? 'Demo user', detail, createdAt: new Date().toISOString(),
  })

  const actions: DataContextValue = {
    data, loading,
    saveProduct: async (input, id) => {
      if (demo) {
        setData((current) => {
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
      await call('saveProduct', { shopId: shop?.id, input, id })
    },
    importProducts: async (rows) => {
      if (!rows.length) throw new Error('No valid products to import')
      if (demo) {
        for (const row of rows) await actions.saveProduct(row)
        return
      }
      await call('importProducts', { shopId: shop?.id, rows })
    },
    archiveProduct: async (id) => {
      if (demo) {
        setData((current) => ({ ...current, products: current.products.map((product) => product.id === id ? { ...product, archived: true, updatedAt: new Date().toISOString() } : product), auditLogs: [audit('product.archived', `Archived product ${id}`), ...current.auditLogs] }))
        return
      }
      await call('archiveProduct', { shopId: shop?.id, id })
    },
    adjustStock: async (id, quantity, reason) => {
      if (demo) {
        setData((current) => {
          const product = current.products.find((item) => item.id === id)
          if (!product) throw new Error('Product not found')
          if (product.stock + quantity < 0) throw new Error('Stock cannot become negative')
          const movement = { id: uid('move'), productId: id, productName: product.name, type: 'adjustment' as const, quantity, reason, createdAt: new Date().toISOString() }
          return { ...current, products: current.products.map((item) => item.id === id ? { ...item, stock: item.stock + quantity, updatedAt: movement.createdAt } : item), stockMovements: [movement, ...current.stockMovements], auditLogs: [audit('stock.adjusted', `${product.name}: ${quantity > 0 ? '+' : ''}${quantity} — ${reason}`), ...current.auditLogs] }
        })
        return
      }
      await call('adjustStock', { shopId: shop?.id, id, quantity, reason })
    },
    createSale: async (input) => {
      if (!demo) return call<Sale>('createSale', { ...input, shopId: shop?.id })
      const result = createDemoSale(data, input, user?.role ?? 'cashier', user?.name ?? 'Demo user')
      setData(result.data)
      return result.sale
    },
    returnSale: async (id) => {
      if (!demo) { await call('returnSale', { shopId: shop?.id, id }); return }
      setData((current) => returnDemoSale(current, id, user?.name ?? 'Demo user'))
    },
    addCustomer: async (input) => {
      if (!demo) { await call('addCustomer', { shopId: shop?.id, input }); return }
      setData((current) => ({ ...current, customers: [{ ...input, id: uid('cust'), createdAt: new Date().toISOString() }, ...current.customers] }))
    },
    recordPayment: async (customerId, amount, method, key) => {
      if (!demo) { await call('recordCustomerPayment', { shopId: shop?.id, customerId, amount, method, idempotencyKey: key }); return }
      setData((current) => recordDemoPayment(current, customerId, amount, method, key, user?.name ?? 'Demo user'))
    },
    addSupplier: async (input) => {
      if (!demo) { await call('addSupplier', { shopId: shop?.id, input }); return }
      setData((current) => ({ ...current, suppliers: [{ ...input, id: uid('sup') }, ...current.suppliers] }))
    },
    createPurchase: async (input) => {
      if (!demo) { await call('createPurchase', { shopId: shop?.id, input }); return }
      setData((current) => {
        const supplier = current.suppliers.find((item) => item.id === input.supplierId)
        if (!supplier || !input.items.length) throw new Error('Supplier and at least one item are required')
        const items = input.items.map((item) => ({ ...item, name: current.products.find((product) => product.id === item.productId)?.name ?? 'Product' }))
        const purchase = { id: uid('po'), supplierId: supplier.id, supplierName: supplier.name, invoiceNumber: input.invoiceNumber, items, total: roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)), status: 'draft' as const, paymentStatus: 'unpaid' as const, createdAt: new Date().toISOString() }
        return { ...current, purchases: [purchase, ...current.purchases] }
      })
    },
    confirmPurchase: async (id) => {
      if (!demo) { await call('confirmPurchase', { shopId: shop?.id, id }); return }
      setData((current) => confirmDemoPurchase(current, id, user?.name ?? 'Demo user'))
    },
    addExpense: async (input) => {
      if (!demo) { await call('addExpense', { shopId: shop?.id, input }); return }
      setData((current) => ({ ...current, expenses: [{ ...input, id: uid('exp') }, ...current.expenses], auditLogs: [audit('expense.recorded', `${input.title} — PKR ${input.amount}`), ...current.auditLogs] }))
    },
  }

  return <DataContext.Provider value={actions}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside DataProvider')
  return context
}
