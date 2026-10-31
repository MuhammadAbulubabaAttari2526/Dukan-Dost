import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '@/app/AuthContext'
import { firebaseServices } from '@/lib/firebase'
import { useData } from '@/app/DataContext'
import { shopSchema, type ShopFormValues } from '@/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormError, PageHeader } from '@/components/Shared'

const profileSchema = shopSchema.extend({ logoUrl: z.string().trim().url('Enter a complete https URL').or(z.literal('')).optional() })
type ProfileValues = ShopFormValues & { logoUrl?: string }

export default function SettingsPage() {
  const { shop, user, demo, updateShop, updateAccount } = useAuth()
  const { data } = useData()
  const [name, setName] = useState(user?.name ?? '')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'manager' | 'cashier'>('cashier')
  const profile = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), values: { name: shop?.name ?? '', contact: shop?.contact ?? '', address: shop?.address ?? '', logoUrl: shop?.logoUrl ?? '' } })
  const submitShop = async (values: ProfileValues) => {
    try { await updateShop({ ...values, logoUrl: values.logoUrl || undefined }); toast.success('Shop profile updated') } catch { toast.error('Could not update the shop profile') }
  }
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ shop, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dukaan-dost-shop-export.json'; link.click(); URL.revokeObjectURL(url)
  }
  return <>
    <PageHeader title="Shop settings" description="Manage your shop profile, account details and authorized data exports." />
    <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="surface p-5"><h2 className="font-semibold">Shop profile</h2><p className="mt-1 text-sm text-slate-600">These details appear on receipts and customer statements.</p><form className="mt-5 space-y-4" onSubmit={profile.handleSubmit(submitShop)}><div><label className="field-label" htmlFor="settings-name">Shop name</label><Input id="settings-name" {...profile.register('name')} /><FormError message={profile.formState.errors.name?.message} /></div><div><label className="field-label" htmlFor="settings-contact">Contact number</label><Input id="settings-contact" {...profile.register('contact')} /><FormError message={profile.formState.errors.contact?.message} /></div><div><label className="field-label" htmlFor="settings-address">Address</label><Textarea id="settings-address" {...profile.register('address')} /><FormError message={profile.formState.errors.address?.message} /></div><div><label className="field-label" htmlFor="settings-logo">Logo URL (optional)</label><Input id="settings-logo" type="url" placeholder="https://example.com/logo.png" {...profile.register('logoUrl')} /><FormError message={profile.formState.errors.logoUrl?.message} /><p className="mt-1 text-xs text-slate-500">Use a secure public image URL. No image is uploaded or stored by this form.</p></div><Button><Save />Save shop profile</Button></form></section>
      <div className="space-y-6"><section className="surface p-5"><UserRound className="mb-4 size-5 text-slate-500" /><h2 className="font-semibold">Your account</h2><form className="mt-4" onSubmit={async (event) => { event.preventDefault(); if (name.trim().length < 2) { toast.error('Enter your full name'); return } await updateAccount(name.trim()); toast.success('Account name updated') }}><label className="field-label" htmlFor="account-name">Full name</label><Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} /><label className="field-label mt-4" htmlFor="account-email">Email</label><Input id="account-email" value={user?.email} disabled /><p className="mt-3 text-sm capitalize text-slate-600">Role: <strong className="text-slate-900">{user?.role.replace('_', ' ')}</strong></p><Button className="mt-4" variant="outline">Save account</Button></form></section><section className="surface p-5"><Download className="mb-4 size-5 text-slate-500" /><h2 className="font-semibold">Data portability</h2><p className="mt-1 text-sm leading-6 text-slate-600">Download the records currently authorized for your shop. The export includes products, sales, ledgers, purchases and expenses.</p><Button className="mt-4" variant="outline" onClick={exportData}>Export JSON</Button></section><section className="surface p-5"><h2 className="font-semibold">Team access</h2><p className="mt-1 text-sm leading-6 text-slate-600">Assign a manager or cashier role to an existing Dukaan Dost account. Public sign-up cannot grant these roles.</p><form className="mt-4" onSubmit={async (event) => { event.preventDefault(); if (!memberEmail.includes('@')) { toast.error('Enter a valid account email'); return } try { if (demo) toast.success('Demo role assignment validated; no cloud membership changed'); else { const callable = httpsCallable(firebaseServices().functions, 'assignMember'); await callable({ shopId: shop?.id, email: memberEmail, role: memberRole }); toast.success('Shop membership and role assigned') } setMemberEmail('') } catch { toast.error('Could not assign this member') } }}><label className="field-label" htmlFor="member-email">Account email</label><Input id="member-email" type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} /><label className="field-label mt-4" htmlFor="member-role">Role</label><select id="member-role" className="flex h-9 w-full rounded-md border bg-white px-3 text-sm" value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'manager' | 'cashier')}><option value="cashier">Cashier</option><option value="manager">Manager</option></select><Button className="mt-4" variant="outline">Assign member</Button></form></section></div>
    </div>
  </>
}
