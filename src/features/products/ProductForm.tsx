import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useData } from '@/app/DataContext'
import { productSchema, type ProductFormValues } from '@/schemas'
import type { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormError } from '@/components/Shared'

export function ProductForm({ open, onOpenChange, product }: { open: boolean; onOpenChange: (open: boolean) => void; product?: Product }) {
  const { saveProduct, data } = useData()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<z.input<typeof productSchema>, unknown, ProductFormValues>({ resolver: zodResolver(productSchema), defaultValues: { name: '', sku: '', category: '', unit: 'piece', cost: 0, price: 0, stock: 0, lowStockThreshold: 5, supplierId: '' } })
  useEffect(() => {
    if (open) form.reset(product ? { name: product.name, sku: product.sku, category: product.category, unit: product.unit, cost: product.cost, price: product.price, stock: product.stock, lowStockThreshold: product.lowStockThreshold, supplierId: product.supplierId ?? '' } : { name: '', sku: '', category: '', unit: 'piece', cost: 0, price: 0, stock: 0, lowStockThreshold: 5, supplierId: '' })
  }, [open, product, form])
  const submit = async (values: ProductFormValues) => {
    setSubmitting(true)
    try { await saveProduct({ ...values, supplierId: values.supplierId || undefined }, product?.id); toast.success(product ? 'Product updated' : 'Product added'); onOpenChange(false) } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save product') } finally { setSubmitting(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{product ? 'Edit product' : 'Add a product'}</DialogTitle><DialogDescription>{product ? 'Price and catalogue changes are saved with an audit log.' : 'Opening stock creates an auditable inventory movement.'}</DialogDescription></DialogHeader><form onSubmit={form.handleSubmit(submit)}><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label" htmlFor="product-name">Product name</label><Input id="product-name" {...form.register('name')} /><FormError message={form.formState.errors.name?.message} /></div><div><label className="field-label" htmlFor="sku">SKU or barcode</label><Input id="sku" {...form.register('sku')} /><FormError message={form.formState.errors.sku?.message} /></div><div><label className="field-label" htmlFor="category">Category</label><Input id="category" placeholder="Grocery" {...form.register('category')} /><FormError message={form.formState.errors.category?.message} /></div><div><label className="field-label" htmlFor="unit">Unit</label><select id="unit" className="flex h-9 w-full rounded-md border bg-white px-3 text-sm" {...form.register('unit')}><option>piece</option><option>pack</option><option>bottle</option><option>box</option><option>kg</option><option>litre</option><option>ream</option></select><FormError message={form.formState.errors.unit?.message} /></div><div><label className="field-label" htmlFor="supplier">Supplier (optional)</label><select id="supplier" className="flex h-9 w-full rounded-md border bg-white px-3 text-sm" {...form.register('supplierId')}><option value="">No supplier</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div><div><label className="field-label" htmlFor="cost">Purchase cost (PKR)</label><Input id="cost" type="number" min="0" step="0.01" {...form.register('cost')} /><FormError message={form.formState.errors.cost?.message} /></div><div><label className="field-label" htmlFor="price">Selling price (PKR)</label><Input id="price" type="number" min="0" step="0.01" {...form.register('price')} /><FormError message={form.formState.errors.price?.message} /></div><div><label className="field-label" htmlFor="stock">Current stock</label><Input id="stock" type="number" min="0" step="1" disabled={Boolean(product)} {...form.register('stock')} /><p className="mt-1 text-xs text-slate-500">{product ? 'Use stock adjustment for quantity changes.' : 'Set opening stock, or enter zero.'}</p><FormError message={form.formState.errors.stock?.message} /></div><div><label className="field-label" htmlFor="threshold">Low-stock threshold</label><Input id="threshold" type="number" min="0" step="1" {...form.register('lowStockThreshold')} /><FormError message={form.formState.errors.lowStockThreshold?.message} /></div></div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={submitting}>{submitting ? 'Saving…' : product ? 'Save changes' : 'Add product'}</Button></DialogFooter></form></DialogContent></Dialog>
}
