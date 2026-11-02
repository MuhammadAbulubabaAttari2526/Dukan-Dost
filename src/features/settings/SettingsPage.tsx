import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download, KeyRound, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { api } from '@/lib/api'
import { shopSchema, type ShopFormValues } from '@/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormError, PageHeader } from '@/components/Shared'
import type { Role } from '@/types'

const profileSchema = shopSchema.extend({ logoUrl: z.string().trim().url('Enter a complete https URL').or(z.literal('')).optional() })
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(12, 'Use at least 12 characters'),
})
type ProfileValues = ShopFormValues & { logoUrl?: string }
type Member = { userId: string; name: string; email: string; role: Role; active: boolean }
type Session = { id: string; createdAt: string; expiresAt: string }

export default function SettingsPage() {
  const { shop, user, demo, updateShop, updateAccount, logout } = useAuth()
  const { data } = useData()
  const [name, setName] = useState(user?.name ?? '')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'manager' | 'cashier'>('cashier')
  const [members, setMembers] = useState<Member[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const profile = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), values: { name: shop?.name ?? '', contact: shop?.contact ?? '', address: shop?.address ?? '', logoUrl: shop?.logoUrl ?? '' } })
  const password = useForm<{ currentPassword: string; newPassword: string }>({ resolver: zodResolver(passwordSchema) })

  const loadSecurityData = useCallback(async () => {
    if (demo || !shop) return
    const [memberRows, sessionRows] = await Promise.all([
      api.get<Member[]>(`/shops/${shop.id}/members`),
      api.get<Session[]>('/auth/sessions'),
    ])
    setMembers(memberRows)
    setSessions(sessionRows)
  }, [demo, shop])

  useEffect(() => {
    if (demo || !shop) return
    let active = true
    Promise.all([
      api.get<Member[]>(`/shops/${shop.id}/members`),
      api.get<Session[]>('/auth/sessions'),
    ]).then(([memberRows, sessionRows]) => {
      if (active) {
        setMembers(memberRows)
        setSessions(sessionRows)
      }
    }).catch((error: unknown) => {
      console.error('Could not load team and session settings', error)
      toast.error('Could not load account security data')
    })
    return () => { active = false }
  }, [demo, shop])

  const submitShop = async (values: ProfileValues) => {
    try { await updateShop({ ...values, logoUrl: values.logoUrl || undefined }); toast.success('Shop profile updated') } catch { toast.error('Could not update the shop profile') }
  }
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ shop, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dukaan-dost-shop-export.json'; link.click(); URL.revokeObjectURL(url)
  }
  const assignMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!memberEmail.includes('@')) { toast.error('Enter a valid account email'); return }
    if (demo) { toast.success('Demo role assignment validated; no cloud membership changed'); return }
    try {
      await api.post(`/shops/${shop?.id}/members`, { email: memberEmail, role: memberRole })
      setMemberEmail('')
      await loadSecurityData()
      toast.success('Shop membership and role assigned')
    } catch { toast.error('Could not assign this member') }
  }
  const changeRole = async (member: Member, role: Role) => {
    try {
      await api.patch(`/shops/${shop?.id}/members/${member.userId}`, { role })
      await loadSecurityData()
      toast.success('Member role updated')
    } catch { toast.error('Could not update the member role') }
  }
  const removeMember = async (member: Member) => {
    try {
      await api.delete(`/shops/${shop?.id}/members/${member.userId}`)
      await loadSecurityData()
      toast.success('Member access removed')
    } catch { toast.error('Could not remove the member') }
  }

  return <>
    <PageHeader title="Shop settings" description="Manage your shop profile, account details and authorized data exports." />
    <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="surface p-5"><h2 className="font-semibold">Shop profile</h2><p className="mt-1 text-sm text-slate-600">These details appear on receipts and customer statements.</p><form className="mt-5 space-y-4" onSubmit={profile.handleSubmit(submitShop)}><div><label className="field-label" htmlFor="settings-name">Shop name</label><Input id="settings-name" {...profile.register('name')} /><FormError message={profile.formState.errors.name?.message} /></div><div><label className="field-label" htmlFor="settings-contact">Contact number</label><Input id="settings-contact" {...profile.register('contact')} /><FormError message={profile.formState.errors.contact?.message} /></div><div><label className="field-label" htmlFor="settings-address">Address</label><Textarea id="settings-address" {...profile.register('address')} /><FormError message={profile.formState.errors.address?.message} /></div><div><label className="field-label" htmlFor="settings-logo">Logo URL (optional)</label><Input id="settings-logo" type="url" placeholder="https://example.com/logo.png" {...profile.register('logoUrl')} /><FormError message={profile.formState.errors.logoUrl?.message} /><p className="mt-1 text-xs text-slate-500">Use a secure public image URL. No image is uploaded or stored by this form.</p></div><Button><Save />Save shop profile</Button></form></section>
      <div className="space-y-6"><section className="surface p-5"><UserRound className="mb-4 size-5 text-slate-500" /><h2 className="font-semibold">Your account</h2><form className="mt-4" onSubmit={async (event) => { event.preventDefault(); if (name.trim().length < 2) { toast.error('Enter your full name'); return } try { await updateAccount(name.trim()); toast.success('Account name updated') } catch { toast.error('Could not update your account') } }}><label className="field-label" htmlFor="account-name">Full name</label><Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} /><label className="field-label mt-4" htmlFor="account-email">Email</label><Input id="account-email" value={user?.email} disabled /><p className="mt-3 text-sm capitalize text-slate-600">Role: <strong className="text-slate-900">{user?.role.replace('_', ' ')}</strong></p><Button className="mt-4" variant="outline">Save account</Button></form></section>
        <section className="surface p-5"><KeyRound className="mb-3 size-5 text-slate-500" /><h2 className="font-semibold">Password and sessions</h2><form className="mt-4 space-y-3" onSubmit={password.handleSubmit(async (values) => { try { await api.post('/auth/change-password', { currentPassword: values.currentPassword, password: values.newPassword }); password.reset(); toast.success('Password changed. Sign in again on your devices.'); await logout() } catch { toast.error('Could not change your password') } })}><div><label className="field-label" htmlFor="current-password">Current password</label><Input id="current-password" type="password" autoComplete="current-password" {...password.register('currentPassword')} /><FormError message={password.formState.errors.currentPassword?.message} /></div><div><label className="field-label" htmlFor="new-password">New password</label><Input id="new-password" type="password" autoComplete="new-password" {...password.register('newPassword')} /><FormError message={password.formState.errors.newPassword?.message} /></div><Button variant="outline">Change password</Button></form><div className="mt-5 space-y-2 border-t pt-4">{sessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-2 text-xs"><span>Signed in {new Date(session.createdAt).toLocaleString()}</span><Button size="sm" variant="ghost" onClick={async () => { try { await api.delete(`/auth/sessions/${session.id}`); await loadSecurityData(); toast.success('Session revoked') } catch { toast.error('Could not revoke session') } }}>Revoke</Button></div>)}{!demo && <Button variant="destructive" size="sm" className="mt-3" onClick={async () => { try { await api.post('/auth/logout-all'); await logout() } catch { toast.error('Could not revoke all sessions') } }}>Sign out all devices</Button>}</div></section>
        <section className="surface p-5"><Download className="mb-4 size-5 text-slate-500" /><h2 className="font-semibold">Data portability</h2><p className="mt-1 text-sm leading-6 text-slate-600">Export the currently loaded records authorized for your shop as JSON.</p><Button className="mt-4" variant="outline" onClick={exportData}>Export JSON</Button></section>
      </div>
      <section className="surface p-5 xl:col-span-2"><h2 className="font-semibold">Team access</h2><p className="mt-1 text-sm leading-6 text-slate-600">Assign a manager or cashier role to an existing account. Public sign-up cannot grant these roles.</p><form className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={assignMember}><div><label className="field-label" htmlFor="member-email">Account email</label><Input id="member-email" type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} /></div><div><label className="field-label" htmlFor="member-role">Role</label><select id="member-role" className="flex h-9 w-full rounded-md border bg-white px-3 text-sm" value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'manager' | 'cashier')}><option value="cashier">Cashier</option><option value="manager">Manager</option></select></div><Button className="self-end" variant="outline">Assign member</Button></form><div className="mt-5 divide-y">{members.map((member) => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{member.name}</p><p className="text-xs text-slate-500">{member.email}</p></div>{member.role === 'owner' ? <span className="text-xs font-medium">Owner</span> : <div className="flex items-center gap-2"><select aria-label={`Role for ${member.email}`} className="h-8 rounded-md border bg-white px-2 text-xs" value={member.role} onChange={(event) => void changeRole(member, event.target.value as Role)}><option value="cashier">Cashier</option><option value="manager">Manager</option></select><Button size="sm" variant="ghost" onClick={() => void removeMember(member)}>Remove</Button></div>}</div>)}</div></section>
    </div>
  </>
}
