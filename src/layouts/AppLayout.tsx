import { useState } from 'react'
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router'
import { BarChart3, Bell, Boxes, ChevronDown, CreditCard, LayoutDashboard, LogOut, Menu, PackagePlus, ReceiptText, Settings, ShieldCheck, ShoppingCart, Store, Users, WalletCards, X } from 'lucide-react'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { can, type Permission } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { canWriteBusiness } from '@/lib/accessPolicy'
import type { Role } from '@/types'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const navigation: Array<{ label: string; path: string; icon: typeof Store; permission: Permission; section?: string }> = [
  { label: 'Overview', path: '/dashboard', icon: LayoutDashboard, permission: 'dashboard', section: 'Workspace' },
  { label: 'Point of sale', path: '/pos', icon: ShoppingCart, permission: 'pos' },
  { label: 'Sales & receipts', path: '/sales', icon: ReceiptText, permission: 'sales' },
  { label: 'Products & stock', path: '/products', icon: Boxes, permission: 'products', section: 'Operations' },
  { label: 'Customers & udhar', path: '/customers', icon: Users, permission: 'customers' },
  { label: 'Purchases', path: '/purchases', icon: PackagePlus, permission: 'purchases' },
  { label: 'Expenses', path: '/expenses', icon: WalletCards, permission: 'expenses' },
  { label: 'Reports', path: '/reports', icon: BarChart3, permission: 'reports', section: 'Insights' },
  { label: 'Subscription', path: '/subscription', icon: CreditCard, permission: 'settings' },
  { label: 'Shop settings', path: '/settings', icon: Settings, permission: 'settings' },
  { label: 'Super admin', path: '/admin', icon: ShieldCheck, permission: 'admin', section: 'Administration' },
]

const pageNames: Record<string, string> = Object.fromEntries(navigation.map((item) => [item.path, item.label]))

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  return <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">{navigation.filter((item) => user && can(user.role, item.permission)).map((item) => <div key={item.path}>{item.section && <p className="mb-2 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 first:mt-0">{item.section}</p>}<NavLink to={item.path} onClick={onNavigate} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white', isActive && 'bg-slate-800 text-white')}><item.icon className="size-[18px]" />{item.label}</NavLink></div>)}</nav>
}

export default function AppLayout() {
  const { user, shop, demo, logout, enterDemo } = useAuth()
  const { data } = useData()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const lowStock = data.products.filter((product) => !product.archived && product.stock <= product.lowStockThreshold).length
  const switchRole = (role: Role) => { enterDemo(role); navigate(role === 'super_admin' ? '/admin' : '/dashboard') }

  return <div className="min-h-dvh bg-slate-50">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-950 lg:flex">
      <Link to="/dashboard" className="flex h-20 items-center gap-3 border-b border-slate-800 px-5"><div className="flex size-9 items-center justify-center rounded-md bg-blue-500 text-sm font-bold text-white">DD</div><div><p className="font-semibold tracking-tight text-white">Dukaan Dost</p><p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Retail operations</p></div></Link>
      <Navigation />
      <div className="border-t border-slate-800 p-4"><p className="truncate text-sm font-medium text-white">{shop?.name}</p><div className="mt-1 flex items-center justify-between text-xs text-slate-400"><span className="capitalize">{shop?.plan} plan</span><span className="capitalize">{shop?.subscriptionStatus.replace('_', ' ')}</span></div></div>
    </aside>
    <div className="lg:pl-60">
      {demo && <div className="flex min-h-9 items-center justify-center bg-blue-50 px-4 py-2 text-center text-xs font-medium text-blue-900">DEMO MODE · Sample session data only · No cloud persistence</div>}
      {shop && !canWriteBusiness(shop) && <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">Business writes are paused by the current shop or subscription status. Records and exports remain available.</div>}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-slate-50/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><button className="flex size-11 items-center justify-center rounded-md hover:bg-slate-100 lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></button><div><p className="text-sm font-semibold text-slate-950 sm:text-base">{pageNames[location.pathname] ?? 'Workspace'}</p><p className="hidden text-xs text-slate-500 sm:block">{new Intl.DateTimeFormat('en-PK', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' }).format(new Date())}</p></div></div>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link to="/products?filter=low-stock" className="relative flex size-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label={`${lowStock} low stock products`}><Bell className="size-5" />{lowStock > 0 && <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">{lowStock}</span>}</Link>
          <DropdownMenu><DropdownMenuTrigger className="flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-slate-100"><div className="hidden text-right sm:block"><p className="text-sm font-medium">{user?.name}</p><p className="text-xs capitalize text-slate-500">{user?.role.replace('_', ' ')}</p></div><div className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{user?.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><ChevronDown className="size-4 text-slate-500" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel>{user?.email}</DropdownMenuLabel>{demo && <><DropdownMenuSeparator /><DropdownMenuLabel>Preview role</DropdownMenuLabel>{(['owner', 'manager', 'cashier', 'super_admin'] as Role[]).map((role) => <DropdownMenuItem key={role} onClick={() => switchRole(role)} className="capitalize">{role.replace('_', ' ')}{user?.role === role ? ' ✓' : ''}</DropdownMenuItem>)}</>}<DropdownMenuSeparator /><DropdownMenuItem onClick={logout}><LogOut />{demo ? 'Exit demo' : 'Sign out'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8"><Outlet /></main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile navigation">{navigation.filter((item) => ['/dashboard', '/pos', '/sales', '/products'].includes(item.path) && user && can(user.role, item.permission)).map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => cn('flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500', isActive && 'text-blue-700')}><item.icon className="size-5" />{item.label === 'Point of sale' ? 'POS' : item.label.split(' ')[0]}</NavLink>)}<button className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500" onClick={() => setMobileOpen(true)}><Menu className="size-5" />More</button></nav>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent className="inset-y-0 left-0 top-0 h-dvh w-[85vw] max-w-xs translate-x-0 translate-y-0 rounded-none bg-slate-950 p-0 text-white sm:max-w-xs" showCloseButton={false}><div className="flex h-16 items-center justify-between border-b border-slate-800 px-5"><DialogTitle className="text-white">Dukaan Dost</DialogTitle><button className="flex size-11 items-center justify-center" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button></div><Navigation onNavigate={() => setMobileOpen(false)} /><div className="border-t border-slate-800 p-4 text-xs text-slate-400">{shop?.name}</div></DialogContent></Dialog>
  </div>
}
