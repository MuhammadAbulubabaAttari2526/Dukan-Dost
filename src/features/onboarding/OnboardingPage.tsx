import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { shopSchema, type ShopFormValues } from '@/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormError } from '@/components/Shared'

export default function OnboardingPage() {
  const { createShop, logout, user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<ShopFormValues>({ resolver: zodResolver(shopSchema), defaultValues: { name: '', contact: '', address: '' } })
  const submit = async (values: ShopFormValues) => {
    setSubmitting(true)
    try { await createShop(values); toast.success('Your shop workspace is ready') } catch { toast.error('Could not create the shop. Please try again.') } finally { setSubmitting(false) }
  }
  return <main className="onboarding-shell flex min-h-dvh items-center justify-center p-5"><section className="onboarding-card w-full max-w-lg p-6 sm:p-8"><div className="mb-6 flex items-start justify-between"><div><Store className="mb-4 size-7 text-primary" /><h1 className="text-2xl font-semibold">Register your shop</h1><p className="mt-1 text-sm text-slate-600">Welcome{user?.name ? `, ${user.name}` : ''}. This creates your private workspace and owner membership.</p></div><button className="text-sm text-slate-600 hover:underline" onClick={logout}>Sign out</button></div><form className="space-y-4" onSubmit={form.handleSubmit(submit)}><div><label className="field-label" htmlFor="shop-name">Shop name</label><Input id="shop-name" placeholder="e.g. Al-Madina General Store" {...form.register('name')} /><FormError message={form.formState.errors.name?.message} /></div><div><label className="field-label" htmlFor="shop-contact">Contact number</label><Input id="shop-contact" placeholder="+92 300 1234567" {...form.register('contact')} /><FormError message={form.formState.errors.contact?.message} /></div><div><label className="field-label" htmlFor="shop-address">Shop address</label><Textarea id="shop-address" placeholder="Street, area, Karachi" {...form.register('address')} /><FormError message={form.formState.errors.address?.message} /></div><div className="onboarding-notice rounded-lg border p-3 text-sm">Your 14-day trial starts after registration. No payment is taken or simulated.</div><Button className="h-11 w-full" disabled={submitting}>{submitting ? 'Creating workspace…' : 'Create shop workspace'}<ArrowRight /></Button></form></section></main>
}
