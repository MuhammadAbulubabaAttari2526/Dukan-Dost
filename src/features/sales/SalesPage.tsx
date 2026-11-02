import { useState } from 'react'
import { Download, Eye, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/Shared'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Receipt } from './Receipt'
import type { Sale } from '@/types'
import { downloadCsv, formatDate, pkr } from '@/utils/format'

export default function SalesPage() {
  const { data, returnSale } = useData()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [receipt, setReceipt] = useState<Sale | undefined>()
  const [returnTarget, setReturnTarget] = useState<Sale | undefined>()
  const filtered = data.sales.filter((sale) => `${sale.receiptNumber} ${sale.customerName ?? 'walk-in'}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || sale.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const visible = filtered.slice((page - 1) * 10, page * 10)
  const exportSales = () => downloadCsv('dukaan-dost-sales.csv', filtered.map((sale) => ({ receipt: sale.receiptNumber, date: sale.createdAt, customer: sale.customerName ?? 'Walk-in', status: sale.status, payment: sale.paymentMethod, subtotal: sale.subtotal, discount: sale.discount, total: sale.total, paid: sale.amountPaid, balance: sale.balanceDue })))
  return <>
    <PageHeader title="Sales & receipts" description="Search billing history, reprint receipts, and reverse completed sales through an auditable return workflow." action={<Button variant="outline" onClick={exportSales}><Download />Export CSV</Button>} />
    <div className="surface overflow-hidden"><div className="flex flex-col gap-3 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input className="pl-9" placeholder="Receipt number or customer" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div><select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="Filter sale status"><option value="all">All statuses</option><option value="completed">Completed</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select></div>
      {visible.length ? <><div className="overflow-x-auto"><table className="table-shell min-w-full"><thead><tr><th>Receipt</th><th className="hidden md:table-cell">Date & time</th><th>Customer</th><th className="hidden lg:table-cell">Payment</th><th className="text-right">Total</th><th className="text-right">Actions</th></tr></thead><tbody>{visible.map((sale) => <tr key={sale.id}><td><p className="font-medium">{sale.receiptNumber}</p><StatusBadge tone={sale.status === 'completed' ? 'green' : 'red'}>{sale.status}</StatusBadge></td><td className="hidden text-slate-600 md:table-cell">{formatDate(sale.createdAt, true)}</td><td>{sale.customerName ?? 'Walk-in'}{sale.balanceDue > 0 && <span className="block text-xs text-amber-700">{pkr(sale.balanceDue)} due</span>}</td><td className="hidden capitalize lg:table-cell">{sale.paymentMethod}</td><td className="text-right font-semibold">{pkr(sale.total)}<span className="block text-xs font-normal text-slate-500">{sale.items.reduce((sum, item) => sum + item.quantity, 0)} units</span></td><td><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`View ${sale.receiptNumber}`} onClick={() => setReceipt(sale)}><Eye /></Button>{sale.status === 'completed' && user?.role !== 'cashier' && <Button variant="ghost" size="icon" aria-label={`Return ${sale.receiptNumber}`} onClick={() => setReturnTarget(sale)}><RotateCcw /></Button>}</div></td></tr>)}</tbody></table></div><Pagination page={page} pages={pages} onPage={setPage} /></> : <EmptyState title="No sales found" description="Completed transactions and their receipt records will appear here." />}
    </div>
    <Receipt sale={receipt} open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(undefined)} />
    <ConfirmDialog open={Boolean(returnTarget)} onOpenChange={(open) => !open && setReturnTarget(undefined)} title="Return this entire sale?" description={`${returnTarget?.receiptNumber} will be marked returned. All items will be restocked, applicable udhar will be reversed, and movement records will be created. This cannot be undone.`} confirmLabel="Return & restock" destructive onConfirm={async () => { if (!returnTarget) return; try { await returnSale(returnTarget.id); toast.success('Sale returned and stock restored') } catch (error) { toast.error(error instanceof Error ? error.message : 'Return failed') } }} />
  </>
}
