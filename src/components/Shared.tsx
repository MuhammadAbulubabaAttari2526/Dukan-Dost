import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Inbox, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p></div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>
}

export function StatCard({ label, value, note, tone = 'default', trend }: { label: string; value: string; note: string; tone?: 'default' | 'positive' | 'warning'; trend?: number }) {
  return <div className="surface p-4">
    <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-slate-600">{label}</p>{typeof trend === 'number' && <span className={cn('flex items-center text-xs font-medium', trend >= 0 ? 'text-teal-700' : 'text-red-700')}>{trend >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}{Math.abs(trend)}%</span>}</div>
    <p className={cn('mt-2 text-2xl font-semibold tracking-tight tabular-nums', tone === 'positive' && 'text-teal-700', tone === 'warning' && 'text-amber-700')}>{value}</p>
    <p className="mt-1 text-xs text-slate-500">{note}</p>
  </div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center"><Inbox className="mb-3 size-7 text-slate-400" /><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
}

export function LoadingPage() {
  return <div className="space-y-6 p-6" aria-label="Loading data"><Skeleton className="h-8 w-56" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div><Skeleton className="h-72" /></div>
}

export function FullScreenLoader() {
  return <div className="flex min-h-dvh items-center justify-center bg-background text-foreground"><LoaderCircle className="mr-3 animate-spin text-primary" /><span>Opening your workspace…</span></div>
}

export function StatusBadge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', green: 'bg-teal-50 text-teal-800', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-800', blue: 'bg-blue-50 text-blue-800' }
  return <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize', tones[tone])}>{children}</span>
}

export function FormError({ message }: { message?: string }) {
  return message ? <p className="field-error" role="alert">{message}</p> : null
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null
  return <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-slate-600">Page {page} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page === pages} onClick={() => onPage(page + 1)}>Next</Button></div></div>
}
