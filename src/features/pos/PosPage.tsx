import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, CreditCard, Minus, Plus, Search, ShoppingCart, Trash2, UserRound, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { EmptyState, PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PaymentMethod, Sale } from '@/types'
import { discountLimit, roundMoney } from '@/utils/business'
import { pkr, uid } from '@/utils/format'
import { Receipt } from '@/features/sales/Receipt'

export default function PosPage() {
  const { data, createSale } = useData()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [discountPercent, setDiscountPercent] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [customerId, setCustomerId] = useState('')
  const [amountPaid, setAmountPaid] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<Sale | undefined>()
  const idempotencyKey = useRef(uid('checkout'))
  const lines = Object.entries(cart).map(([productId, quantity]) => ({ product: data.products.find((item) => item.id === productId), quantity })).filter((line) => line.product && line.quantity > 0)
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + (line.product?.price ?? 0) * line.quantity, 0))
  const discount = roundMoney(subtotal * discountPercent / 100)
  const total = roundMoney(Math.max(0, subtotal - discount))
  const maxDiscount = Math.round(discountLimit(user?.role ?? 'cashier') * 100)
  const results = useMemo(() => data.products.filter((product) => !product.archived && `${product.name} ${product.sku}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30), [data.products, search])
  useEffect(() => { setAmountPaid(method === 'credit' ? 0 : total) }, [method, total])

  const add = (productId: string) => {
    const product = data.products.find((item) => item.id === productId)
    if (!product || product.stock <= 0) { toast.error('This product is out of stock'); return }
    setCart((current) => {
      const quantity = current[productId] ?? 0
      if (quantity >= product.stock) { toast.error(`Only ${product.stock} ${product.unit} available`); return current }
      return { ...current, [productId]: quantity + 1 }
    })
  }
  const setQuantity = (productId: string, quantity: number) => {
    const product = data.products.find((item) => item.id === productId)
    if (!product) return
    if (quantity > product.stock) { toast.error(`Only ${product.stock} ${product.unit} available`); return }
    setCart((current) => { const next = { ...current }; if (quantity <= 0) delete next[productId]; else next[productId] = quantity; return next })
  }
  const completeSale = async () => {
    if (!lines.length || submitting) return
    if (method === 'credit' && !customerId) { toast.error('Select a customer for a credit sale'); return }
    if (amountPaid < total && method !== 'credit' ) { toast.error('Amount paid is less than the sale total'); return }
    setSubmitting(true)
    try {
      const sale = await createSale({ items: lines.map((line) => ({ productId: line.product!.id, quantity: line.quantity })), discount, paymentMethod: method, amountPaid, customerId: customerId || undefined, idempotencyKey: idempotencyKey.current })
      setReceipt(sale)
      setCart({}); setDiscountPercent(0); setCustomerId(''); setMethod('cash'); idempotencyKey.current = uid('checkout')
      toast.success(`${sale.receiptNumber} completed · stock updated`)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Sale could not be completed. No retry charge was made.') } finally { setSubmitting(false) }
  }

  return <>
    <PageHeader title="Point of sale" description="Search, bill and print. Prices and totals are verified again by the trusted backend in live mode." />
    <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="surface overflow-hidden"><div className="border-b p-4"><div className="relative"><Search className="absolute left-3 top-3 size-5 text-slate-400" /><Input autoFocus className="h-11 pl-10" placeholder="Scan barcode or search products…" aria-label="Search products for sale" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && results.length) { add(results[0].id); if (results.length === 1) setSearch('') } }} /></div><p className="mt-2 text-xs text-slate-500">Press Enter to add the first result · Showing active products only</p></div>{results.length ? <div className="grid max-h-[68dvh] gap-0 overflow-y-auto sm:grid-cols-2">{results.map((product) => <button key={product.id} className="flex min-h-24 items-center gap-3 border-b p-4 text-left transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 sm:odd:border-r" disabled={product.stock <= 0} onClick={() => add(product.id)}><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium">{product.name}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{product.sku}</p><p className={`mt-1 text-xs ${product.stock <= product.lowStockThreshold ? 'font-medium text-amber-700' : 'text-slate-500'}`}>{product.stock > 0 ? `${product.stock} ${product.unit} available` : 'Out of stock'}</p></div><div className="text-right"><p className="font-semibold tabular-nums">{pkr(product.price)}</p><Plus className="ml-auto mt-2 size-4 text-blue-600" /></div></button>)}</div> : <EmptyState title="No matching products" description="Check the product name or barcode, or add the item in Products & stock." />}</section>
      <section className="surface overflow-hidden xl:sticky xl:top-24"><div className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2"><ShoppingCart className="size-5" /><h2 className="font-semibold">Current sale</h2><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{lines.length} items</span></div>{lines.length > 0 && <button className="text-xs font-medium text-red-700 hover:underline" onClick={() => setCart({})}>Clear cart</button>}</div>
        {lines.length ? <><div className="max-h-64 divide-y overflow-y-auto">{lines.map((line) => <div key={line.product!.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.product!.name}</p><p className="text-xs text-slate-500">{pkr(line.product!.price)} / {line.product!.unit}</p></div><div className="flex items-center rounded-md border"><Button variant="ghost" size="icon-sm" aria-label="Decrease quantity" onClick={() => setQuantity(line.product!.id, line.quantity - 1)}><Minus /></Button><input className="h-8 w-10 border-x text-center text-sm" aria-label={`Quantity for ${line.product!.name}`} type="number" min="1" max={line.product!.stock} value={line.quantity} onChange={(event) => setQuantity(line.product!.id, Number(event.target.value))} /><Button variant="ghost" size="icon-sm" aria-label="Increase quantity" onClick={() => setQuantity(line.product!.id, line.quantity + 1)}><Plus /></Button></div><p className="w-20 text-right text-sm font-semibold tabular-nums">{pkr(line.product!.price * line.quantity)}</p><Button variant="ghost" size="icon-sm" aria-label={`Remove ${line.product!.name}`} onClick={() => setQuantity(line.product!.id, 0)}><Trash2 /></Button></div>)}</div>
          <div className="space-y-4 border-t bg-slate-50 p-4"><div className="grid grid-cols-2 gap-3"><div><label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600" htmlFor="customer"><UserRound className="size-3" />Customer</label><select id="customer" className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Walk-in customer</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="discount">Discount % · max {maxDiscount}%</label><Input id="discount" type="number" min="0" max={maxDiscount} step="0.5" value={discountPercent} onChange={(event) => setDiscountPercent(Math.min(maxDiscount, Math.max(0, Number(event.target.value))))} /></div></div>
            <div><span className="mb-2 block text-xs font-medium text-slate-600">Payment method</span><div className="grid grid-cols-3 gap-2">{([{ id: 'cash', label: 'Cash', icon: Banknote }, { id: 'digital', label: 'Digital', icon: WalletCards }, { id: 'credit', label: 'Udhar', icon: CreditCard }] as const).map((item) => <button key={item.id} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium ${method === item.id ? 'border-blue-600 bg-blue-50 text-blue-800' : 'bg-white hover:bg-slate-100'}`} onClick={() => setMethod(item.id)}><item.icon className="size-4" />{item.label}</button>)}</div></div>
            <div className="space-y-1 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{pkr(subtotal)}</span></div><div className="flex justify-between text-slate-600"><span>Discount</span><span>− {pkr(discount)}</span></div><div className="flex justify-between border-t pt-2 text-xl font-semibold"><span>Total</span><span>{pkr(total)}</span></div></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="amount-paid">Amount paid (PKR)</label><Input id="amount-paid" type="number" min="0" max={method === 'credit' ? total : undefined} step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(Math.max(0, Number(event.target.value)))} />{method === 'cash' && amountPaid > total && <p className="mt-1 text-xs font-medium text-teal-700">Change due: {pkr(amountPaid - total)}</p>}{method === 'credit' && <p className="mt-1 text-xs text-amber-700">Balance due: {pkr(Math.max(0, total - amountPaid))} · added to customer ledger</p>}</div>
            <Button className="h-12 w-full text-base" disabled={submitting || !lines.length || (method === 'credit' && !customerId)} onClick={completeSale}>{submitting ? 'Processing securely…' : `Complete sale · ${pkr(total)}`}</Button><p className="text-center text-[11px] text-slate-500">Protected against duplicate submission with a unique checkout key</p>
          </div></> : <EmptyState title="Your cart is empty" description="Search or scan a product to begin a new sale. Stock is deducted only after completion." />}
      </section>
    </div>
    <Receipt sale={receipt} open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(undefined)} />
  </>
}
