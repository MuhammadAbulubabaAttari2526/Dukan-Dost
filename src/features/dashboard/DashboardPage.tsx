import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, PackageX, ShoppingBag } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { bestSelling, customerBalance, metricsForRange, startOfPakistanDay } from '@/utils/business'
import { formatDate, pkr, toDateInput } from '@/utils/format'

type Range = 'today' | 'yesterday' | '7days' | '30days' | 'custom'

export default function DashboardPage() {
  const { data } = useData()
  const { user, shop } = useAuth()
  const [range, setRange] = useState<Range>('today')
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date()))
  const [customTo, setCustomTo] = useState(toDateInput(new Date()))
  const { from, to } = useMemo(() => {
    const today = startOfPakistanDay()
    if (range === 'custom') return { from: new Date(`${customFrom}T00:00:00+05:00`), to: new Date(`${customTo}T23:59:59+05:00`) }
    const offset = range === 'yesterday' ? -1 : range === '7days' ? -6 : range === '30days' ? -29 : 0
    const from = startOfPakistanDay(offset)
    const to = range === 'yesterday' ? new Date(today.getTime() - 1) : new Date()
    return { from, to }
  }, [range, customFrom, customTo])
  const metrics = useMemo(() => metricsForRange(data, from, to), [data, from, to])
  const lowStock = data.products.filter((product) => !product.archived && product.stock <= product.lowStockThreshold)
  const outstanding = data.customers.reduce((sum, customer) => sum + Math.max(0, customerBalance(data, customer.id)), 0)
  const best = bestSelling({ ...data, sales: metrics.sales })
  const chart = useMemo(() => Array.from({ length: 7 }).map((_, index) => {
    const day = startOfPakistanDay(index - 6)
    const next = startOfPakistanDay(index - 5)
    const value = data.sales.filter((sale) => sale.status === 'completed' && new Date(sale.createdAt) >= day && new Date(sale.createdAt) < next).reduce((sum, sale) => sum + sale.total, 0)
    return { day: new Intl.DateTimeFormat('en-PK', { weekday: 'short', timeZone: 'Asia/Karachi' }).format(day), sales: value }
  }), [data.sales])
  const financialAccess = user?.role !== 'cashier'

  return <>
    <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.name.split(' ')[0]}`} description={`Here’s what’s happening at ${shop?.name}. Values are calculated from your authorized shop records.`} action={<Link to="/pos"><Button><ShoppingBag />New sale</Button></Link>} />
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"><div><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="range">Reporting period</label><select id="range" className="h-9 rounded-md border bg-white px-3 text-sm" value={range} onChange={(event) => setRange(event.target.value as Range)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option><option value="custom">Custom range</option></select></div>{range === 'custom' && <><div><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="from">From</label><input id="from" type="date" className="h-9 rounded-md border bg-white px-3 text-sm" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></div><div><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="to">To</label><input id="to" type="date" className="h-9 rounded-md border bg-white px-3 text-sm" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></div></>}<span className="ml-auto hidden text-xs text-slate-500 sm:block">Pakistan Standard Time</span></div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Business summary">
      <StatCard label="Net sales" value={pkr(metrics.netSales)} note={`${metrics.transactions} completed transaction${metrics.transactions === 1 ? '' : 's'} · after discounts`} />
      {financialAccess && <StatCard label="Cost of goods sold" value={pkr(metrics.cogs)} note="Using saved product cost snapshots" />}
      {financialAccess && <StatCard label="Estimated gross profit" value={pkr(metrics.grossProfit)} note="Net sales minus cost of goods sold" tone="positive" />}
      {financialAccess && <StatCard label="Recorded expenses" value={pkr(metrics.expenses)} note="Operating expenses only, not inventory purchases" />}
      {financialAccess && <StatCard label="Estimated operating result" value={pkr(metrics.operatingResult)} note="Gross profit minus recorded expenses" tone={metrics.operatingResult >= 0 ? 'positive' : 'warning'} />}
      <StatCard label="Outstanding udhar" value={pkr(outstanding)} note={`${data.customers.filter((customer) => customerBalance(data, customer.id) > 0).length} customers with a balance`} tone="warning" />
    </section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="surface min-w-0"><div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-semibold">Sales rhythm</h2><p className="text-xs text-slate-500">Completed net sales · last 7 days</p></div><Link to="/reports" className="text-sm font-medium text-blue-700 hover:underline">Full report</Link></div><div className="h-64 px-3 pb-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} /><YAxis axisLine={false} tickLine={false} fontSize={12} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => pkr(Number(value))} cursor={{ fill: '#f1f5f9' }} /><Bar dataKey="sales" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div></div>
      <div className="surface"><div className="border-b px-5 py-4"><h2 className="font-semibold">Best-selling products</h2><p className="text-xs text-slate-500">By units sold in the selected period</p></div>{best.length ? <div className="divide-y">{best.map((item, index) => <div key={item.name} className="flex items-center gap-3 px-5 py-3"><span className="w-5 text-sm font-semibold text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-slate-500">{pkr(item.revenue)} sales value</p></div><span className="text-sm font-semibold tabular-nums">{item.quantity} units</span></div>)}</div> : <EmptyState title="No sales in this period" description="Completed sales will rank your best-selling products here." />}</div>
    </section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="surface overflow-hidden"><div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-semibold">Recent transactions</h2><p className="text-xs text-slate-500">Latest billing activity</p></div><Link to="/sales" className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">View all<ArrowRight className="size-4" /></Link></div><div className="overflow-x-auto"><table className="table-shell min-w-[560px]"><thead><tr><th>Receipt</th><th>Customer</th><th>Time</th><th>Payment</th><th className="text-right">Total</th></tr></thead><tbody>{data.sales.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((sale) => <tr key={sale.id}><td className="font-medium">{sale.receiptNumber}<StatusBadge tone={sale.status === 'completed' ? 'green' : 'red'}>{sale.status}</StatusBadge></td><td>{sale.customerName ?? 'Walk-in customer'}</td><td className="text-slate-600">{formatDate(sale.createdAt, true)}</td><td className="capitalize">{sale.paymentMethod}</td><td className="text-right font-semibold tabular-nums">{pkr(sale.total)}</td></tr>)}</tbody></table></div></div>
      <div className="surface"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Stock attention</h2><p className="text-xs text-slate-500">At or below reorder threshold</p></div><PackageX className="size-5 text-amber-600" /></div>{lowStock.length ? <div className="divide-y">{lowStock.slice(0, 5).map((product) => <Link to="/products?filter=low-stock" key={product.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-slate-500">Reorder at {product.lowStockThreshold} {product.unit}</p></div><StatusBadge tone={product.stock === 0 ? 'red' : 'amber'}>{product.stock} left</StatusBadge></Link>)}</div> : <EmptyState title="Stock levels look good" description="No active product is below its low-stock threshold." />}</div>
    </section>
  </>
}
