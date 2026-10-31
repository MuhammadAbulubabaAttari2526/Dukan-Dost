import { Check, Download, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { PageHeader, StatusBadge } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { formatDate, pkr } from '@/utils/format'

export default function SubscriptionPage() {
  const { shop } = useAuth()
  const { data } = useData()
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ shop, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `dukaan-dost-${shop?.id}-export.json`; link.click(); URL.revokeObjectURL(url)
    toast.success('Authorized shop data exported')
  }
  return <>
    <PageHeader title="Subscription" description="Review your plan and trial status. Manual activation is recorded only by an authorized super admin." action={<Button variant="outline" onClick={exportData}><Download />Export shop data</Button>} />
    <div className="surface mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-3"><h2 className="text-xl font-semibold capitalize">{shop?.plan} plan</h2><StatusBadge tone={shop?.subscriptionStatus === 'active' ? 'green' : shop?.subscriptionStatus === 'trial' ? 'blue' : 'amber'}>{shop?.subscriptionStatus.replace('_', ' ')}</StatusBadge></div><p className="mt-1 text-sm text-slate-600">Renewal or review date: {shop ? formatDate(shop.renewalDate) : '—'}</p></div><div className="text-sm text-slate-600"><p className="font-medium text-slate-900">No payment gateway connected</p><p>No successful payment is claimed or simulated.</p></div></div>
    <div className="grid gap-5 md:grid-cols-2">{[{ id: 'starter', price: 499, description: 'For a single counter building dependable records.', features: ['Products, stock and POS', 'Customer udhar ledger', 'Daily reports and CSV export'] }, { id: 'business', price: 999, description: 'For growing shops that need broader controls.', features: ['Everything in Starter', 'Advanced profit analytics', 'Staff roles and audit history'] }].map((plan) => <section key={plan.id} className={`surface p-5 ${shop?.plan === plan.id ? 'ring-2 ring-blue-500' : ''}`}><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold capitalize">{plan.id}</h2><p className="mt-1 text-sm text-slate-600">{plan.description}</p></div>{shop?.plan === plan.id && <StatusBadge tone="blue">Current plan</StatusBadge>}</div><p className="mt-5 text-3xl font-semibold">{pkr(plan.price)}<span className="text-sm font-normal text-slate-500"> / month</span></p><p className="mt-1 text-xs text-slate-500">Proposed MVP pricing; manual activation only</p><ul className="mt-5 space-y-2">{plan.features.map((feature) => <li key={feature} className="flex items-center gap-2 text-sm"><Check className="size-4 text-teal-600" />{feature}</li>)}</ul></section>)}</div>
    <section className="surface mt-6 overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-semibold">Subscription history</h2><p className="text-xs text-slate-500">Plan states and authorized administrative changes</p></div>{data.subscriptions.length ? <div className="divide-y">{data.subscriptions.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).map((record) => <div key={record.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="font-medium capitalize">{record.plan} · {record.status.replace('_', ' ')}</p><p className="text-sm text-slate-600">{record.note}</p></div><div className="text-sm text-slate-600 sm:text-right"><p>{formatDate(record.startDate)} — {formatDate(record.renewalDate)}</p></div></div>)}</div> : <div className="p-5 text-sm text-slate-600">Subscription events will appear after shop activation.</div>}</section>
    <div className="mt-6 flex gap-3 rounded-lg border bg-slate-100 p-4 text-sm text-slate-700"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><p><strong>Expired-access policy:</strong> business writes are blocked after expiry, but records are preserved. Owners retain sign-in, subscription management and data export access. No payment provider is integrated in this MVP.</p></div>
  </>
}
