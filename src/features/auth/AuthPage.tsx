import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Check, Eye, EyeOff, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormError } from '@/components/Shared'
import { loginSchema, signupSchema } from '@/schemas'
import type { Role } from '@/types'

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>

export default function AuthPage() {
  const { signIn, signUp, resetPassword, enterDemo, firebaseConfigured } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const signupForm = useForm<SignupValues>({ resolver: zodResolver(signupSchema), defaultValues: { name: '', email: '', password: '', confirmPassword: '' } })

  const submitLogin = async (values: LoginValues) => {
    setSubmitting(true)
    try { await signIn(values.email, values.password) } catch { toast.error('Sign in failed. Check your email and password.') } finally { setSubmitting(false) }
  }
  const submitSignup = async (values: SignupValues) => {
    setSubmitting(true)
    try { await signUp(values.name, values.email, values.password); toast.success('Account created. Set up your shop to continue.') } catch { toast.error('Could not create the account. The email may already be registered.') } finally { setSubmitting(false) }
  }
  const demo = (role: Role = 'owner') => enterDemo(role)

  return <main className="grid min-h-dvh bg-slate-50 lg:grid-cols-[0.9fr_1.1fr]">
    <section className="relative hidden overflow-hidden bg-slate-950 px-12 py-10 text-slate-100 lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-blue-500 font-bold text-white">DD</div><div><p className="font-semibold tracking-tight">Dukaan Dost</p><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Retail operations</p></div></div>
      <div className="max-w-lg"><p className="mb-4 text-sm font-medium text-blue-300">Built for the everyday business of Karachi</p><h1 className="text-4xl font-semibold leading-tight tracking-tight">Your counter, stock and udhar — finally in one place.</h1><p className="mt-5 max-w-md text-base leading-7 text-slate-300">Fast billing, dependable stock records and clear customer ledgers for general stores, kiryana and stationery shops.</p>
        <div className="mt-10 grid grid-cols-3 gap-5 border-t border-slate-700 pt-7 text-sm">{['Atomic sales', 'Auditable stock', 'PKR reporting'].map((item) => <div key={item} className="flex items-center gap-2 text-slate-300"><Check className="size-4 text-teal-400" />{item}</div>)}</div>
      </div>
      <p className="text-xs text-slate-400">Pakistan Standard Time · Secure shop-scoped records</p>
    </section>
    <section className="flex items-center justify-center px-5 py-8 sm:px-10">
      <div className="w-full max-w-md">
        <div className="mb-8 lg:hidden"><p className="text-xl font-semibold">Dukaan Dost</p><p className="text-sm text-slate-600">Retail operations for your shop</p></div>
        <h2 className="text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="mt-1 text-sm text-slate-600">{mode === 'login' ? 'Sign in to manage your shop.' : 'Start with your account, then register your shop.'}</p>
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1"><button className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'}`} onClick={() => setMode('login')}>Sign in</button><button className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'}`} onClick={() => setMode('signup')}>Create account</button></div>
        {!firebaseConfigured && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Demo workspace available.</strong> Connect Firebase in <code>.env</code> to enable live accounts and cloud data.</div>}
        {mode === 'login' ? <form className="mt-6 space-y-4" onSubmit={loginForm.handleSubmit(submitLogin)}>
          <div><label className="field-label" htmlFor="email">Email address</label><Input id="email" type="email" autoComplete="email" placeholder="you@shop.pk" disabled={!firebaseConfigured} {...loginForm.register('email')} /><FormError message={loginForm.formState.errors.email?.message} /></div>
          <div><div className="flex items-center justify-between"><label className="field-label" htmlFor="password">Password</label><button type="button" className="mb-1.5 text-xs font-medium text-blue-700 hover:underline" onClick={() => setForgotOpen(true)}>Forgot password?</button></div><div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="pr-10" disabled={!firebaseConfigured} {...loginForm.register('password')} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-2.5 text-slate-500" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><FormError message={loginForm.formState.errors.password?.message} /></div>
          <Button className="h-11 w-full" disabled={!firebaseConfigured || submitting}>{submitting ? 'Signing in…' : 'Sign in'}<ArrowRight /></Button>
        </form> : <form className="mt-6 space-y-4" onSubmit={signupForm.handleSubmit(submitSignup)}>
          <div><label className="field-label" htmlFor="name">Full name</label><Input id="name" autoComplete="name" disabled={!firebaseConfigured} {...signupForm.register('name')} /><FormError message={signupForm.formState.errors.name?.message} /></div>
          <div><label className="field-label" htmlFor="signup-email">Email address</label><Input id="signup-email" type="email" autoComplete="email" disabled={!firebaseConfigured} {...signupForm.register('email')} /><FormError message={signupForm.formState.errors.email?.message} /></div>
          <div><label className="field-label" htmlFor="signup-password">Password</label><Input id="signup-password" type="password" autoComplete="new-password" disabled={!firebaseConfigured} {...signupForm.register('password')} /><FormError message={signupForm.formState.errors.password?.message} /></div>
          <div><label className="field-label" htmlFor="confirm-password">Confirm password</label><Input id="confirm-password" type="password" autoComplete="new-password" disabled={!firebaseConfigured} {...signupForm.register('confirmPassword')} /><FormError message={signupForm.formState.errors.confirmPassword?.message} /></div>
          <Button className="h-11 w-full" disabled={!firebaseConfigured || submitting}>{submitting ? 'Creating account…' : 'Create account'}<ArrowRight /></Button>
        </form>}
        <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs uppercase tracking-wide text-slate-500">or explore safely</span><div className="h-px flex-1 bg-slate-200" /></div>
        <Button variant="outline" className="h-11 w-full border-slate-300" onClick={() => demo()}><Store />Open interactive demo</Button>
        <p className="mt-3 text-center text-xs leading-5 text-slate-500">Demo data stays in this session only. It is never represented as a live Firebase record.</p>
      </div>
    </section>
    <Dialog open={forgotOpen} onOpenChange={setForgotOpen}><DialogContent><DialogHeader><DialogTitle>Reset your password</DialogTitle><DialogDescription>We’ll send a reset link if the account exists.</DialogDescription></DialogHeader><form onSubmit={async (event) => { event.preventDefault(); if (!forgotEmail.includes('@')) { toast.error('Enter a valid email'); return } try { await resetPassword(forgotEmail); toast.success('Reset email sent'); setForgotOpen(false) } catch { toast.error('Could not send the reset email') } }}><label className="field-label" htmlFor="forgot-email">Email address</label><Input id="forgot-email" type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required /><Button className="mt-4 w-full" disabled={!firebaseConfigured}>Send reset link</Button></form></DialogContent></Dialog>
  </main>
}
