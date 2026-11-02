import '../../App.css'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Info,
  Lock,
  LogIn,
  Mail,
  Package2,
  ShieldCheck,
  Store,
  UserRound,
  Zap,
} from 'lucide-react'
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
  const { signIn, signUp, resetPassword, enterDemo, apiConfigured } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [showDemoNotice, setShowDemoNotice] = useState(true)
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

  return (
    <main className="dukaan-shell">
      <div className="dukaan-grid">
        <section className="dukaan-left-panel">
          <div className="brand-row">
            <div className="brand-mark">DD</div>
            <div className="brand-copy">
              <span className="brand-title">Dukaan Dost</span>
              <span className="brand-subtitle">Retail Operations</span>
            </div>
          </div>

          <div className="dukaan-hero">
            <div className="hero-script">Grow Together</div>
            <h1>
              Your counter, stock<br />
              and udhar —<br />
              finally in <span>one place.</span>
            </h1>
            <p>
              Fast billing, dependable stock records and clear customer ledgers for general stores,
              kiryana and stationery shops.
            </p>
          </div>

          <div className="feature-grid">
            <div className="feature-pill">
              <span className="feature-icon"><Zap /></span>
              <span>Fast<br />Billing</span>
            </div>
            <div className="feature-pill">
              <span className="feature-icon"><Package2 /></span>
              <span>Stock<br />Management</span>
            </div>
            <div className="feature-pill">
              <span className="feature-icon"><BarChart3 /></span>
              <span>PKR<br />Reporting</span>
            </div>
          </div>

        </section>

        <section className="dukaan-auth-panel">
          <div className="auth-card">
            <div className="store-emblem"><Store /></div>
            <div className="auth-header">
              <h2 id="auth-title">{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h2>
              <p>{mode === 'login' ? 'Sign in to manage your shop.' : 'Start with your account, then register your shop.'}</p>
            </div>

            <div className="auth-switcher" role="group" aria-label="Account options">
              <button aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
                Sign In
              </button>
              <button aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">
                Create Account
              </button>
            </div>

            {!apiConfigured && showDemoNotice && (
              <div className="demo-banner">
                <div className="demo-icon"><Info /></div>
                <p>
                  <strong>Demo workspace available.</strong> Configure the API server to enable live accounts and cloud data.
                </p>
                <button type="button" aria-label="Dismiss demo notice" onClick={() => setShowDemoNotice(false)}>×</button>
              </div>
            )}

            {mode === 'login' ? (
              <form aria-labelledby="auth-title" className="auth-form" onSubmit={loginForm.handleSubmit(submitLogin)}>
                <div className="field-block">
                  <label htmlFor="email">Email address</label>
                  <div className="input-shell">
                    <Mail className="input-icon" />
                    <Input id="email" type="email" autoComplete="email" placeholder="you@shop.pk" disabled={!apiConfigured} {...loginForm.register('email')} />
                  </div>
                  <FormError message={loginForm.formState.errors.email?.message} />
                </div>

                <div className="field-block">
                  <div className="field-row">
                    <label htmlFor="password">Password</label>
                    <button type="button" className="forgot-link" onClick={() => { setForgotEmail(loginForm.getValues('email')); setForgotOpen(true) }}>Forgot password?</button>
                  </div>
                  <div className="input-shell">
                    <Lock className="input-icon" />
                    <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" disabled={!apiConfigured} {...loginForm.register('password')} />
                    <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  <FormError message={loginForm.formState.errors.password?.message} />
                </div>

                <Button className="primary-button" disabled={!apiConfigured || submitting} type="submit">
                  {submitting ? 'Signing in…' : 'Sign in'}
                  <LogIn />
                </Button>
              </form>
            ) : (
              <form aria-labelledby="auth-title" className="auth-form" onSubmit={signupForm.handleSubmit(submitSignup)}>
                <div className="field-block">
                  <label htmlFor="name">Full name</label>
                  <div className="input-shell">
                    <UserRound className="input-icon" />
                    <Input id="name" autoComplete="name" placeholder="Your full name" disabled={!apiConfigured} {...signupForm.register('name')} />
                  </div>
                  <FormError message={signupForm.formState.errors.name?.message} />
                </div>

                <div className="field-block">
                  <label htmlFor="signup-email">Email address</label>
                  <div className="input-shell">
                    <Mail className="input-icon" />
                    <Input id="signup-email" type="email" autoComplete="email" placeholder="you@shop.pk" disabled={!apiConfigured} {...signupForm.register('email')} />
                  </div>
                  <FormError message={signupForm.formState.errors.email?.message} />
                </div>

                <div className="field-block">
                  <label htmlFor="signup-password">Password</label>
                  <div className="input-shell">
                    <Lock className="input-icon" />
                    <Input id="signup-password" type="password" autoComplete="new-password" placeholder="Create a password" disabled={!apiConfigured} {...signupForm.register('password')} />
                  </div>
                  <FormError message={signupForm.formState.errors.password?.message} />
                </div>

                <div className="field-block">
                  <label htmlFor="confirm-password">Confirm password</label>
                  <div className="input-shell">
                    <Lock className="input-icon" />
                    <Input id="confirm-password" type="password" autoComplete="new-password" placeholder="Confirm your password" disabled={!apiConfigured} {...signupForm.register('confirmPassword')} />
                  </div>
                  <FormError message={signupForm.formState.errors.confirmPassword?.message} />
                </div>

                <Button className="primary-button" disabled={!apiConfigured || submitting} type="submit">
                  {submitting ? 'Creating account…' : 'Create account'}
                  <ArrowRight />
                </Button>
              </form>
            )}

            <div className="divider-row">
              <span />
              <span>or explore safely</span>
              <span />
            </div>

            <Button type="button" variant="outline" className="demo-button" onClick={() => demo()}>
              <Store />
              Open Interactive Demo
            </Button>

            <div className="checkbox-row">
              <span className="check-badge"><ShieldCheck /></span>
              <span>Your data is safe with us.</span>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>We’ll send a reset link if the account exists.</DialogDescription>
          </DialogHeader>
          <form onSubmit={async (event) => {
            event.preventDefault()
            if (!forgotEmail.includes('@')) {
              toast.error('Enter a valid email')
              return
            }
            try {
              await resetPassword(forgotEmail)
              toast.success('If the account exists, reset instructions will be sent.')
              setForgotOpen(false)
            } catch {
              toast.error('Could not submit the reset request')
            }
          }}>
            <label className="field-label" htmlFor="forgot-email">Email address</label>
            <Input id="forgot-email" type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required />
            <Button className="mt-4 w-full" disabled={!apiConfigured}>Send reset link</Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
