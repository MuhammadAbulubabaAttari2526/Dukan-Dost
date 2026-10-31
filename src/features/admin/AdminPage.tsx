import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { firebaseServices } from '@/lib/firebase'
import type { Shop, SubscriptionStatus } from '@/types'
import { formatDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { PageHeader, StatCard, StatusBadge } from '@/components/Shared'

type AdminShop = Shop & { ownerName?: string; ownerEmail?: string; productCount: number; salesCount: number }

export default function AdminPage() {
  const { shop, demo, updateShop } = useAuth()
  const { data } = useData()
  const [shops, setShops] = useState<AdminShop[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!shop) return
    if (demo) {
      setShops([{ ...shop, ownerName: 'Ahmed Raza', ownerEmail: 'ahmed@almadina.pk', productCount: data.products.length, salesCount: data.sales.length }, { ...shop, id: 'demo_shop_2', name: 'Student Point Stationers', contact: '+92 333 5551234', address: 'Gulshan-e-Iqbal, Karachi', plan: 'starter', subscriptionStatus: 'active', productCount: 46, salesCount: 182 }, { ...shop, id: 'demo_shop_3', name: 'Noor Kiryana Store', contact: '+92 300 8882211', address: 'Lyari, Karachi', plan: 'starter', subscriptionStatus: 'past_due', status: 'suspended', productCount: 31, salesCount: 94 }])
      setLoading(false); return
    }
    const load = async () => {
      try { const callable = httpsCallable<void, AdminShop[]>(firebaseServices().functions, 'adminListShops'); const result = await callable(); setShops(result.data) } catch { toast.error('Could not load authorized shop administration data') } finally { setLoading(false) }
    }
    load()
  }, [demo, shop?.id])
  const change = async (target: AdminShop, patch: Partial<Shop>) => {
    try { await updateShop(patch, target.id); setShops((current) => current.map((item) => item.id === target.id ? { ...item, ...patch } : item)); toast.success('Administrative change saved with an audit record') } catch { toast.error('Administrative update failed') }
  }
  return <>
    <PageHeader title="Super admin" description="Authorized shop and subscription administration. Every privileged change is audit logged server-side." />
    <section className="mb-6 grid gap-4 sm:grid-cols-3"><StatCard label="Registered shops" value={String(shops.length)} note="Authorized administrative records" /><StatCard label="Active subscriptions" value={String(shops.filter((item) => item.subscriptionStatus === 'active').length)} note="Manually activated plans" /><StatCard label="Suspended shops" value={String(shops.filter((item) => item.status === 'suspended').length)} note="Business writes blocked" tone="warning" /></section>
    <div className="surface overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-semibold">Shop & subscription controls</h2><p className="text-xs text-slate-500">No payment activation occurs without authorized manual confirmation</p></div>{loading ? <p className="p-5 text-sm text-slate-600">Loading shops…</p> : <div className="overflow-x-auto"><table className="table-shell min-w-full"><thead><tr><th>Shop</th><th className="hidden lg:table-cell">Owner</th><th>Plan</th><th>Status</th><th className="hidden xl:table-cell">Usage</th><th className="text-right">Access</th></tr></thead><tbody>{shops.map((item) => <tr key={item.id}><td><p className="font-medium">{item.name}</p><p className="text-xs text-slate-500">Renews {formatDate(item.renewalDate)}</p></td><td className="hidden lg:table-cell"><p>{item.ownerName}</p><p className="text-xs text-slate-500">{item.ownerEmail}</p></td><td><select className="h-8 rounded-md border bg-white px-2 text-xs" value={item.plan} onChange={(event) => change(item, { plan: event.target.value as Shop['plan'] })}><option value="starter">Starter</option><option value="business">Business</option></select><select className="ml-1 h-8 rounded-md border bg-white px-2 text-xs" value={item.subscriptionStatus} onChange={(event) => change(item, { subscriptionStatus: event.target.value as SubscriptionStatus })}><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></td><td><StatusBadge tone={item.status === 'active' ? 'green' : 'red'}>{item.status}</StatusBadge></td><td className="hidden text-xs text-slate-600 xl:table-cell">{item.productCount} products · {item.salesCount} sales</td><td className="text-right"><Button size="sm" variant="outline" onClick={() => change(item, { status: item.status === 'active' ? 'suspended' : 'active' })}>{item.status === 'active' ? 'Suspend' : 'Activate'}</Button></td></tr>)}</tbody></table></div>}</div>
    <section className="surface mt-6"><div className="flex items-center gap-2 border-b px-5 py-4"><ShieldCheck className="size-5" /><div><h2 className="font-semibold">Privileged action audit</h2><p className="text-xs text-slate-500">Recent shop operations and administrative events</p></div></div><div className="divide-y">{data.auditLogs.slice(0, 8).map((log) => <div key={log.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-medium">{log.detail}</p><p className="font-mono text-xs text-slate-500">{log.action}</p></div><div className="text-xs text-slate-500 sm:text-right"><p>{log.actor}</p><p>{formatDate(log.createdAt, true)}</p></div></div>)}</div></section>
  </>
}
