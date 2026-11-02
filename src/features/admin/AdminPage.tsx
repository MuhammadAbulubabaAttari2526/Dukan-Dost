import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/app/AuthContext'
import type { Shop, SubscriptionStatus } from '@/types'
import { formatDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { PageHeader, StatCard, StatusBadge } from '@/components/Shared'

type AdminShop = Shop & {
  ownerName?: string
  ownerEmail?: string
  productCount: number
  salesCount: number
  lastActivity?: string
  subscriptionHistory?: Array<{ id: string; status: SubscriptionStatus; plan: Shop['plan']; createdAt: string; note: string }>
}
type AdminAudit = { id: string; action: string; shopId?: string; actorId: string; createdAt: string }

export default function AdminPage() {
  const { logout } = useAuth()
  const [shops, setShops] = useState<AdminShop[]>([])
  const [audit, setAudit] = useState<AdminAudit[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [shopRows, auditRows] = await Promise.all([
        api.get<AdminShop[]>('/admin/shops?limit=100'),
        api.get<AdminAudit[]>('/admin/audit?limit=50'),
      ])
      setShops(shopRows)
      setAudit(auditRows)
    } catch {
      toast.error('Could not load authorized shop administration data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const change = async (target: AdminShop, patch: Partial<Shop>) => {
    try {
      await api.patch(`/admin/shops/${target.id}`, patch)
      await load()
      toast.success('Administrative change saved with an audit record')
    } catch {
      toast.error('Administrative update failed')
    }
  }

  return <main className="min-h-dvh bg-slate-50 p-4 sm:p-8">
    <header className="mx-auto flex max-w-7xl items-center justify-between"><Link to="/admin" className="font-semibold">Dukaan Dost · Super admin</Link><Button variant="outline" onClick={() => void logout()}>Sign out</Button></header>
    <div className="mx-auto mt-8 max-w-7xl">
      <PageHeader title="Super admin" description="Shop and subscription administration. Every privileged change is audited server-side." />
      <section className="mb-6 grid gap-4 sm:grid-cols-3"><StatCard label="Registered shops" value={String(shops.length)} note="Authorized administrative records" /><StatCard label="Active subscriptions" value={String(shops.filter((item) => item.subscriptionStatus === 'active').length)} note="Manually activated plans" /><StatCard label="Suspended shops" value={String(shops.filter((item) => item.status === 'suspended').length)} note="Business writes blocked" tone="warning" /></section>
      <div className="surface overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-semibold">Shop & subscription controls</h2><p className="text-xs text-slate-500">Prices are proposed. No payment activation occurs without authorized manual confirmation.</p></div>{loading ? <p className="p-5 text-sm text-slate-600">Loading shops…</p> : <div className="overflow-x-auto"><table className="table-shell min-w-full"><thead><tr><th>Shop</th><th className="hidden lg:table-cell">Owner</th><th>Plan</th><th>Status</th><th className="hidden xl:table-cell">Usage / activity</th><th className="text-right">Access</th></tr></thead><tbody>{shops.map((item) => <tr key={item.id}><td><p className="font-medium">{item.name}</p><p className="text-xs text-slate-500">Renews {formatDate(item.renewalDate)}</p><p className="text-xs text-slate-500">{item.subscriptionHistory?.length ?? 0} subscription events</p></td><td className="hidden lg:table-cell"><p>{item.ownerName}</p><p className="text-xs text-slate-500">{item.ownerEmail}</p></td><td><select aria-label={`Plan for ${item.name}`} className="h-8 rounded-md border bg-white px-2 text-xs" value={item.plan} onChange={(event) => void change(item, { plan: event.target.value as Shop['plan'] })}><option value="starter">Starter · proposed PKR 499/mo</option><option value="business">Business · proposed PKR 999/mo</option></select><select aria-label={`Subscription status for ${item.name}`} className="mt-1 h-8 rounded-md border bg-white px-2 text-xs" value={item.subscriptionStatus} onChange={(event) => void change(item, { subscriptionStatus: event.target.value as SubscriptionStatus })}><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></td><td><StatusBadge tone={item.status === 'active' ? 'green' : 'red'}>{item.status}</StatusBadge></td><td className="hidden text-xs text-slate-600 xl:table-cell">{item.productCount} products · {item.salesCount} sales<p>Last activity: {item.lastActivity ? formatDate(item.lastActivity, true) : '—'}</p></td><td className="text-right"><Button size="sm" variant="outline" onClick={() => void change(item, { status: item.status === 'active' ? 'suspended' : 'active' })}>{item.status === 'active' ? 'Suspend' : 'Activate'}</Button></td></tr>)}</tbody></table></div>}</div>
      <section className="surface mt-6"><div className="flex items-center gap-2 border-b px-5 py-4"><ShieldCheck className="size-5" /><div><h2 className="font-semibold">Cross-shop privileged action audit</h2><p className="text-xs text-slate-500">Administrative changes across shops</p></div></div><div className="divide-y">{audit.map((entry) => <div key={entry.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-medium">{entry.action}</p><p className="font-mono text-xs text-slate-500">Shop {entry.shopId ?? '—'} · Actor {entry.actorId}</p></div><div className="text-xs text-slate-500 sm:text-right">{formatDate(entry.createdAt, true)}</div></div>)}</div></section>
    </div>
  </main>
}
