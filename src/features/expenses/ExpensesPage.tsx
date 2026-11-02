import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download, Plus, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/app/DataContext'
import { expenseSchema } from '@/schemas'
import { downloadCsv, formatDate, pkr, toDateInput } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, FormError, PageHeader } from '@/components/Shared'

export default function ExpensesPage() {
  const { data, addExpense } = useData()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState('month')
  const form = useForm<z.input<typeof expenseSchema>, unknown, z.output<typeof expenseSchema>>({ resolver: zodResolver(expenseSchema), defaultValues: { title: '', category: '', amount: 0, date: toDateInput(new Date()), paymentMethod: 'cash', note: '' } })
  const filtered = useMemo(() => {
    const now = new Date()
    return data.expenses.filter((expense) => {
      const days = (now.getTime() - new Date(`${expense.date}T23:59:59+05:00`).getTime()) / 86400000
      return period === 'all' || (period === 'day' ? days <= 1 : period === 'week' ? days <= 7 : days <= 31)
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [data.expenses, period])
  const total = filtered.reduce((sum, expense) => sum + expense.amount, 0)
  const categories = Object.entries(filtered.reduce<Record<string, number>>((result, expense) => { result[expense.category] = (result[expense.category] ?? 0) + expense.amount; return result }, {})).sort((a, b) => b[1] - a[1])
  const submit = async (values: z.infer<typeof expenseSchema>) => {
    try { await addExpense({ ...values, note: values.note || undefined }); toast.success('Operating expense recorded'); setOpen(false); form.reset({ title: '', category: '', amount: 0, date: toDateInput(new Date()), paymentMethod: 'cash', note: '' }) } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not record expense') }
  }
  return <>
    <PageHeader title="Expense management" description="Track daily operating costs separately from inventory purchases so gross profit is not double-counted." action={<><Button variant="outline" onClick={() => downloadCsv('dukaan-dost-expenses.csv', filtered.map((expense) => ({ ...expense })))}><Download />Export</Button><Button onClick={() => setOpen(true)}><Plus />Record expense</Button></>} />
    <div className="mb-5 flex flex-wrap gap-2">{[['day', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days'], ['all', 'All records']].map(([id, label]) => <button key={id} className={`min-h-10 rounded-md border px-4 text-sm font-medium ${period === id ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white hover:bg-slate-100'}`} onClick={() => setPeriod(id)}>{label}</button>)}</div>
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="surface p-4"><p className="text-sm text-slate-600">Recorded expenses</p><p className="mt-1 text-2xl font-semibold">{pkr(total)}</p><p className="text-xs text-slate-500">Selected reporting period</p></div><div className="surface p-4"><p className="text-sm text-slate-600">Expense entries</p><p className="mt-1 text-2xl font-semibold">{filtered.length}</p><p className="text-xs text-slate-500">Auditable operating records</p></div><div className="surface p-4"><p className="text-sm text-slate-600">Largest category</p><p className="mt-1 text-xl font-semibold">{categories[0]?.[0] ?? '—'}</p><p className="text-xs text-slate-500">{categories[0] ? pkr(categories[0][1]) : 'No expenses in period'}</p></div></div>
    <div className="surface overflow-hidden">{filtered.length ? <div className="overflow-x-auto"><table className="table-shell min-w-full"><thead><tr><th>Expense</th><th>Category</th><th className="hidden md:table-cell">Date</th><th className="hidden lg:table-cell">Method</th><th className="text-right">Amount</th></tr></thead><tbody>{filtered.map((expense) => <tr key={expense.id}><td><p className="font-medium">{expense.title}</p>{expense.note && <p className="text-xs text-slate-500">{expense.note}</p>}</td><td>{expense.category}</td><td className="hidden text-slate-600 md:table-cell">{formatDate(`${expense.date}T12:00:00+05:00`)}</td><td className="hidden capitalize lg:table-cell">{expense.paymentMethod}</td><td className="text-right font-semibold">{pkr(expense.amount)}</td></tr>)}</tbody></table></div> : <EmptyState title="No expenses in this period" description="Record rent, utilities, transport and other operating costs here." action={<Button onClick={() => setOpen(true)}><Plus />Record expense</Button>} />}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Record an operating expense</DialogTitle><DialogDescription>Do not enter inventory purchases here; use Purchases to avoid double-counting COGS.</DialogDescription></DialogHeader><form onSubmit={form.handleSubmit(submit)}><label className="field-label" htmlFor="expense-title">Expense title</label><Input id="expense-title" placeholder="e.g. Electricity bill" {...form.register('title')} /><FormError message={form.formState.errors.title?.message} /><div className="mt-4 grid grid-cols-2 gap-4"><div><label className="field-label" htmlFor="expense-category">Category</label><select id="expense-category" className="flex h-9 w-full rounded-md border bg-white px-3 text-sm" {...form.register('category')}><option value="">Select</option><option>Rent</option><option>Utilities</option><option>Transport</option><option>Staff</option><option>Maintenance</option><option>Other</option></select><FormError message={form.formState.errors.category?.message} /></div><div><label className="field-label" htmlFor="expense-amount">Amount (PKR)</label><Input id="expense-amount" type="number" min="0.01" step="0.01" {...form.register('amount')} /><FormError message={form.formState.errors.amount?.message} /></div><div><label className="field-label" htmlFor="expense-date">Date</label><Input id="expense-date" type="date" max={toDateInput(new Date())} {...form.register('date')} /><FormError message={form.formState.errors.date?.message} /></div><div><label className="field-label" htmlFor="expense-method">Payment method</label><select id="expense-method" className="flex h-9 w-full rounded-md border bg-white px-3 text-sm" {...form.register('paymentMethod')}><option value="cash">Cash</option><option value="digital">Digital</option></select></div></div><label className="field-label mt-4" htmlFor="expense-note">Note (optional)</label><Textarea id="expense-note" {...form.register('note')} /><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button><ReceiptText />Save expense</Button></DialogFooter></form></DialogContent></Dialog>
  </>
}
