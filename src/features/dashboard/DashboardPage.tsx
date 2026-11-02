import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Clock3,
  FileText,
  PackagePlus,
  ShoppingCart,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/app/AuthContext'
import { useData } from '@/app/DataContext'
import { EmptyState } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { customerBalance, metricsForRange, startOfPakistanDay } from '@/utils/business'
import { formatDate, pkr, toDateInput } from '@/utils/format'
import './DashboardPage.css'

type Range = 'today' | 'yesterday' | '7days' | '30days' | 'custom'
type ActivityItem = {
  id: string
  title: string
  detail: string
  createdAt: string
  href: string
  icon: LucideIcon
  tone: 'green' | 'pink'
}

const relativeTime = (value: string) => {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

export default function DashboardPage() {
  const { data } = useData()
  const { user, shop } = useAuth()
  const [range, setRange] = useState<Range>('today')
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date()))
  const [customTo, setCustomTo] = useState(toDateInput(new Date()))
  const { from, to } = useMemo(() => {
    const today = startOfPakistanDay()
    if (range === 'custom') return { from: new Date(`${customFrom}T00:00:00+05:00`), to: new Date(`${customTo}T23:59:59+05:00`) }
    const offset = range === 'yesterday' ? -1 : range === '7days' ? -6 : range === '30days' ? -29 : 0
    const from = startOfPakistanDay(offset)
    const to = range === 'yesterday' ? new Date(today.getTime() - 1) : new Date()
    return { from, to }
  }, [range, customFrom, customTo])
  const metrics = useMemo(() => metricsForRange(data, from, to), [data, from, to])
  const todayMetrics = useMemo(() => metricsForRange(data, startOfPakistanDay(), new Date()), [data])
  const activeProducts = data.products.filter((product) => !product.archived)
  const lowStock = activeProducts.filter((product) => product.stock <= product.lowStockThreshold)
  const totalStock = activeProducts.reduce((sum, product) => sum + product.stock, 0)
  const outstanding = data.customers.reduce((sum, customer) => sum + Math.max(0, customerBalance(data, customer.id)), 0)
  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'
  const chart = useMemo(() => Array.from({ length: 7 }).map((_, index) => {
    const day = startOfPakistanDay(index - 6)
    const next = startOfPakistanDay(index - 5)
    const sales = data.sales
      .filter((sale) => sale.status === 'completed' && new Date(sale.createdAt) >= day && new Date(sale.createdAt) < next)
      .reduce((sum, sale) => sum + sale.total, 0)
    return { day: new Intl.DateTimeFormat('en-PK', { weekday: 'short', timeZone: 'Asia/Karachi' }).format(day), sales }
  }), [data.sales])
  const activities = useMemo<ActivityItem[]>(() => [
    ...data.sales.filter((sale) => sale.status === 'completed').map((sale) => ({
      id: `sale-${sale.id}`,
      title: `New sale of ${pkr(sale.total)}`,
      detail: sale.customerName ?? 'Walk-in customer',
      createdAt: sale.createdAt,
      href: '/sales',
      icon: ShoppingCart,
      tone: 'pink' as const,
    })),
    ...data.stockMovements.map((movement) => ({
      id: `stock-${movement.id}`,
      title: 'Stock updated',
      detail: `${movement.productName} (${movement.quantity > 0 ? '+' : ''}${movement.quantity})`,
      createdAt: movement.createdAt,
      href: '/products',
      icon: Boxes,
      tone: 'green' as const,
    })),
    ...data.customers.map((customer) => ({
      id: `customer-${customer.id}`,
      title: 'New customer added',
      detail: customer.name,
      createdAt: customer.createdAt,
      href: '/customers',
      icon: UserRoundPlus,
      tone: 'green' as const,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [data.customers, data.sales, data.stockMovements])

  const stats: Array<{ label: string; value: string; note: string; icon: LucideIcon; tone: 'green' | 'pink' }> = [
    { label: 'Total sales', value: pkr(metrics.netSales), note: `${metrics.transactions} completed bills in period`, icon: ShoppingCart, tone: 'green' },
    { label: 'Total stock items', value: new Intl.NumberFormat('en-PK').format(totalStock), note: `${activeProducts.length} active products`, icon: Boxes, tone: 'pink' },
    { label: 'Total customers', value: new Intl.NumberFormat('en-PK').format(data.customers.length), note: 'In your customer book', icon: UsersRound, tone: 'green' },
    { label: "Today's bills", value: new Intl.NumberFormat('en-PK').format(todayMetrics.transactions), note: 'Completed sales today', icon: FileText, tone: 'pink' },
  ]

  const quickActions: Array<{ label: string; href: string; icon: LucideIcon; tone: 'green' | 'pink' }> = [
    { label: 'New sale', href: '/pos', icon: ShoppingCart, tone: 'pink' },
    { label: 'Add product', href: '/products?create=1', icon: PackagePlus, tone: 'green' },
    { label: 'Customers & udhar', href: '/customers', icon: UsersRound, tone: 'green' },
    { label: 'View reports', href: '/reports', icon: BarChart3, tone: 'pink' },
  ]

  return (
    <div className="dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="dashboard-eyebrow">Shop overview</p>
          <h1>Good {greeting}, {user?.name.split(' ')[0]}!</h1>
          <p className="dashboard-description">Here’s what’s happening at {shop?.name} today.</p>
        </div>
        <div className="dashboard-welcome-actions">
          <span className="dashboard-credit">Outstanding udhar <strong>{pkr(outstanding)}</strong></span>
          <Link to="/pos"><Button className="dashboard-new-sale"><ShoppingCart />New Sale<ArrowRight /></Button></Link>
        </div>
      </header>

      <section className="dashboard-stats" aria-label="Business summary">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <article className="dashboard-stat surface" key={stat.label}>
              <span className={`dashboard-stat-icon ${stat.tone}`}><Icon /></span>
              <div className="dashboard-stat-copy">
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.note}</span>
              </div>
              <span className={`dashboard-stat-accent ${stat.tone}`} aria-hidden="true" />
            </article>
          )
        })}
      </section>

      <section className="dashboard-panels" aria-label="Sales and business activity">
        <article className="dashboard-panel dashboard-sales surface">
          <div className="dashboard-panel-heading">
            <div className="dashboard-title-with-icon">
              <span className="dashboard-heading-icon"><TrendingUp /></span>
              <div>
                <h2>Sales overview</h2>
                <p>Completed sales · last 7 days</p>
              </div>
            </div>
            <div className="dashboard-periods">
              <label className="sr-only" htmlFor="range">Reporting period</label>
              <select id="range" value={range} onChange={(event) => setRange(event.target.value as Range)}>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7days">This week</option>
                <option value="30days">This month</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          {range === 'custom' && (
            <div className="dashboard-custom-range">
              <label>From <input aria-label="From date" type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></label>
              <label>To <input aria-label="To date" type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></label>
            </div>
          )}
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="sales-area-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#315C4C" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#315C4C" stopOpacity={0.015} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E8DFD3" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#78847B', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78847B', fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value) => pkr(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#E8DFD3', background: '#FFFDF9' }} />
                <Area type="monotone" dataKey="sales" stroke="#315C4C" strokeWidth={2.5} fill="url(#sales-area-fill)" activeDot={{ r: 5, fill: '#315C4C', stroke: '#FFF7E8', strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-sales-summary">
            <span>Selected period</span>
            <strong>{pkr(metrics.netSales)}</strong>
            <span>Net sales</span>
          </div>
        </article>

        <article className="dashboard-panel dashboard-quick surface">
          <div className="dashboard-panel-heading">
            <div className="dashboard-title-with-icon">
              <span className="dashboard-heading-icon pink"><WalletCards /></span>
              <div><h2>Quick actions</h2><p>Shortcuts for your shop</p></div>
            </div>
          </div>
          <div className="dashboard-quick-grid">
            {quickActions.map((action) => {
              const Icon = action.icon
              return <Link key={action.label} to={action.href} className="dashboard-quick-action">
                <span className={`dashboard-action-icon ${action.tone}`}><Icon /></span>
                <span>{action.label}</span>
              </Link>
            })}
          </div>
        </article>

        <article className="dashboard-panel dashboard-activity surface">
          <div className="dashboard-panel-heading">
            <div className="dashboard-title-with-icon">
              <span className="dashboard-heading-icon"><Clock3 /></span>
              <div><h2>Recent activity</h2><p>Latest updates from your shop</p></div>
            </div>
            <Link to="/sales" className="dashboard-view-all">View all<ArrowRight /></Link>
          </div>
          {activities.length ? (
            <div className="dashboard-activity-list">
              {activities.map((activity) => {
                const Icon = activity.icon
                return <Link to={activity.href} className="dashboard-activity-item" key={activity.id}>
                  <span className="dashboard-activity-marker" />
                  <span className={`dashboard-activity-icon ${activity.tone}`}><Icon /></span>
                  <span className="dashboard-activity-copy">
                    <strong>{activity.title}</strong>
                    <span>{activity.detail}</span>
                    <time dateTime={activity.createdAt}>{relativeTime(activity.createdAt)}</time>
                  </span>
                </Link>
              })}
            </div>
          ) : <EmptyState title="No activity yet" description="Sales, stock changes and new customers will show up here." />}
        </article>
      </section>

      <Link to="/products?filter=low-stock" className="dashboard-stock-banner">
        <span className="dashboard-stock-icon"><Boxes /></span>
        <span className="dashboard-stock-copy">
          <strong>{lowStock.length ? 'Stock needs attention' : 'Your stock looks healthy'}</strong>
          <span>{lowStock.length ? `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} at or below reorder level.` : 'No products are below their reorder level.'}</span>
        </span>
        <span className="dashboard-stock-link">{lowStock.length ? 'Review stock' : 'View products'}<ArrowRight /></span>
      </Link>
    </div>
  )
}
