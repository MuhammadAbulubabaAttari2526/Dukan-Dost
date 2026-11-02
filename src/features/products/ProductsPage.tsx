import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams } from 'react-router'
import { z } from 'zod'
import { Archive, Download, History, Pencil, Plus, Search, SlidersHorizontal, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/app/DataContext'
import { adjustmentSchema, productSchema, type ProductFormValues } from '@/schemas'
import type { Product } from '@/types'
import { downloadCsv, formatDate, pkr } from '@/utils/format'
import { parseCsv } from '@/utils/csv'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, FormError, PageHeader, Pagination, StatusBadge } from '@/components/Shared'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ProductForm } from './ProductForm'

export default function ProductsPage() {
  const { data, adjustStock, archiveProduct, importProducts } = useData()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState(params.get('filter') ?? 'active')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [selected, setSelected] = useState<Product | undefined>()
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | undefined>()
  const [historyProduct, setHistoryProduct] = useState<Product | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<Product | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)
  const adjustment = useForm<z.input<typeof adjustmentSchema>, unknown, z.output<typeof adjustmentSchema>>({ resolver: zodResolver(adjustmentSchema), defaultValues: { quantity: 1, reason: '' } })
  const categories = [...new Set(data.products.map((product) => product.category))].sort()
  const filtered = data.products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'all' || product.category === category
    const matchesFilter = filter === 'all' || (filter === 'archived' ? product.archived : !product.archived && (filter !== 'low-stock' || product.stock <= product.lowStockThreshold))
    return matchesSearch && matchesCategory && matchesFilter
  }).sort((a, b) => a.name.localeCompare(b.name))
  const pages = Math.max(1, Math.ceil(filtered.length / 8))
  const visible = filtered.slice((page - 1) * 8, page * 8)
  useEffect(() => { setPage(1) }, [search, category, filter])
  useEffect(() => {
    setSearch(params.get('search') ?? '')
    if (params.get('filter') === 'low-stock') setFilter('low-stock')
    if (params.get('create') === '1') {
      setSelected(undefined)
      setFormOpen(true)
      setParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('create')
        return next
      }, { replace: true })
    }
  }, [params, setParams])

  const submitAdjustment = async (values: z.infer<typeof adjustmentSchema>) => {
    if (!adjustmentProduct) return
    try { await adjustStock(adjustmentProduct.id, values.quantity, values.reason); toast.success('Stock adjusted with a movement record'); setAdjustmentProduct(undefined); adjustment.reset() } catch (error) { toast.error(error instanceof Error ? error.message : 'Adjustment failed') }
  }
  const exportProducts = () => downloadCsv('dukaan-dost-products.csv', filtered.map((product) => ({ name: product.name, sku: product.sku, category: product.category, unit: product.unit, cost: product.cost, price: product.price, stock: product.stock, lowStockThreshold: product.lowStockThreshold })))
  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const rows = parseCsv(await file.text())
      const parsed: ProductFormValues[] = []
      const errors: string[] = []
      const skus = new Set(data.products.filter((product) => !product.archived).map((product) => product.sku.toLowerCase()))
      rows.forEach((row, index) => {
        const result = productSchema.safeParse({ ...row, supplierId: row.supplierid || undefined })
        if (!result.success) errors.push(`Row ${index + 2}: ${result.error.issues[0].message}`)
        else if (skus.has(result.data.sku.toLowerCase())) errors.push(`Row ${index + 2}: duplicate SKU ${result.data.sku}`)
        else { parsed.push(result.data); skus.add(result.data.sku.toLowerCase()) }
      })
      if (errors.length) { toast.error(errors.slice(0, 3).join(' · ')); return }
      await importProducts(parsed)
      toast.success(`${parsed.length} products imported with opening-stock records`)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'CSV import failed') } finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return <>
    <PageHeader title="Products & stock" description="Manage your catalogue, audit every quantity change, and act on low-stock alerts." action={<><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => importFile(event.target.files?.[0])} /><Button variant="outline" onClick={() => fileRef.current?.click()}><Upload />Import CSV</Button><Button onClick={() => { setSelected(undefined); setFormOpen(true) }}><Plus />Add product</Button></>} />
    <div className="surface overflow-hidden">
      <div className="flex flex-col gap-3 p-4 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input className="pl-9" placeholder="Search name, SKU or barcode" aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="h-9 rounded-md border bg-white px-3 text-sm" aria-label="Filter category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select className="h-9 rounded-md border bg-white px-3 text-sm" aria-label="Filter stock status" value={filter} onChange={(event) => { setFilter(event.target.value); setParams(event.target.value === 'low-stock' ? { filter: 'low-stock' } : {}) }}><option value="active">Active products</option><option value="low-stock">Low stock</option><option value="archived">Archived</option><option value="all">All products</option></select><Button variant="outline" size="icon" aria-label="Export filtered products" onClick={exportProducts}><Download /></Button></div>
      <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2 text-xs text-slate-600"><span>{filtered.length} product{filtered.length === 1 ? '' : 's'}</span><span className="flex items-center gap-1"><SlidersHorizontal className="size-3" />Stock value: {pkr(filtered.reduce((sum, product) => sum + product.stock * product.cost, 0))}</span></div>
      {visible.length ? <><div className="overflow-x-auto"><table className="table-shell min-w-full"><thead><tr><th>Product</th><th className="hidden md:table-cell">Category</th><th className="text-right">Cost / price</th><th className="text-right">Stock</th><th className="hidden lg:table-cell">Updated</th><th className="text-right">Actions</th></tr></thead><tbody>{visible.map((product) => <tr key={product.id} className={product.archived ? 'opacity-60' : ''}><td><p className="font-medium">{product.name}</p><p className="font-mono text-xs text-slate-500">{product.sku}</p></td><td className="hidden md:table-cell">{product.category}<span className="block text-xs text-slate-500">Per {product.unit}</span></td><td className="text-right tabular-nums"><span className="block text-xs text-slate-500">{pkr(product.cost)}</span><span className="font-medium">{pkr(product.price)}</span></td><td className="text-right"><StatusBadge tone={product.archived ? 'slate' : product.stock <= product.lowStockThreshold ? 'amber' : 'green'}>{product.archived ? 'Archived' : `${product.stock} ${product.unit}`}</StatusBadge></td><td className="hidden text-sm text-slate-600 lg:table-cell">{formatDate(product.updatedAt)}</td><td><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Stock history" aria-label={`History for ${product.name}`} onClick={() => setHistoryProduct(product)}><History /></Button>{!product.archived && <><Button variant="ghost" size="icon" title="Adjust stock" aria-label={`Adjust ${product.name}`} onClick={() => { setAdjustmentProduct(product); adjustment.reset({ quantity: 1, reason: '' }) }}><Plus /></Button><Button variant="ghost" size="icon" title="Edit product" aria-label={`Edit ${product.name}`} onClick={() => { setSelected(product); setFormOpen(true) }}><Pencil /></Button><Button variant="ghost" size="icon" title="Archive product" aria-label={`Archive ${product.name}`} onClick={() => setArchiveTarget(product)}><Archive /></Button></>}</div></td></tr>)}</tbody></table></div><Pagination page={page} pages={pages} onPage={setPage} /></> : <EmptyState title="No products found" description="Try another search or filter, or add your first product to start billing." action={<Button onClick={() => { setSelected(undefined); setFormOpen(true) }}><Plus />Add product</Button>} />}
    </div>
    <ProductForm open={formOpen} onOpenChange={setFormOpen} product={selected} />
    <Dialog open={Boolean(adjustmentProduct)} onOpenChange={(open) => !open && setAdjustmentProduct(undefined)}><DialogContent><DialogHeader><DialogTitle>Adjust stock</DialogTitle><DialogDescription>{adjustmentProduct?.name} currently has {adjustmentProduct?.stock} {adjustmentProduct?.unit}. Use a negative quantity to remove stock.</DialogDescription></DialogHeader><form onSubmit={adjustment.handleSubmit(submitAdjustment)}><label className="field-label" htmlFor="adjust-quantity">Quantity change</label><Input id="adjust-quantity" type="number" step="1" {...adjustment.register('quantity')} /><FormError message={adjustment.formState.errors.quantity?.message} /><label className="field-label mt-4" htmlFor="adjust-reason">Reason</label><Input id="adjust-reason" placeholder="e.g. Damaged items or stock count correction" {...adjustment.register('reason')} /><FormError message={adjustment.formState.errors.reason?.message} /><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setAdjustmentProduct(undefined)}>Cancel</Button><Button>Record adjustment</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(historyProduct)} onOpenChange={(open) => !open && setHistoryProduct(undefined)}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Stock movement history</DialogTitle><DialogDescription>{historyProduct?.name} · every change is recorded</DialogDescription></DialogHeader>{data.stockMovements.filter((movement) => movement.productId === historyProduct?.id).length ? <div className="divide-y">{data.stockMovements.filter((movement) => movement.productId === historyProduct?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((movement) => <div key={movement.id} className="flex items-start gap-4 py-3"><StatusBadge tone={movement.quantity > 0 ? 'green' : 'slate'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</StatusBadge><div className="flex-1"><p className="text-sm font-medium">{movement.reason}</p><p className="text-xs capitalize text-slate-500">{movement.type} · {formatDate(movement.createdAt, true)}</p></div></div>)}</div> : <EmptyState title="No movements recorded" description="Purchases, sales and adjustments will appear here." />}</DialogContent></Dialog>
    <ConfirmDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(undefined)} title="Archive this product?" description={`${archiveTarget?.name} will no longer appear in POS search. Its sales and stock history will be preserved.`} confirmLabel="Archive product" destructive onConfirm={async () => { if (!archiveTarget) return; try { await archiveProduct(archiveTarget.id); toast.success('Product archived') } catch { toast.error('Could not archive product') } }} />
  </>
}
