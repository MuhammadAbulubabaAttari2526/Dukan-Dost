import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/app/AuthContext'
import { DataProvider, useData } from '@/app/DataContext'
import { can, type Permission } from '@/lib/permissions'
import { FullScreenLoader } from '@/components/Shared'
import AppLayout from '@/layouts/AppLayout'
import AuthPage from '@/features/auth/AuthPage'
import OnboardingPage from '@/features/onboarding/OnboardingPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import ProductsPage from '@/features/products/ProductsPage'
import PosPage from '@/features/pos/PosPage'
import SalesPage from '@/features/sales/SalesPage'
import CustomersPage from '@/features/customers/CustomersPage'
import PurchasesPage from '@/features/purchases/PurchasesPage'
import ExpensesPage from '@/features/expenses/ExpensesPage'
import ReportsPage from '@/features/reports/ReportsPage'
import SubscriptionPage from '@/features/subscriptions/SubscriptionPage'
import SettingsPage from '@/features/settings/SettingsPage'
import AdminPage from '@/features/admin/AdminPage'

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user } = useAuth()
  return user && can(user.role, permission) ? children : <Navigate to="/dashboard" replace />
}

function Workspace() {
  const { loading } = useData()
  if (loading) return <FullScreenLoader />
  return <Routes><Route element={<AppLayout />}><Route path="/dashboard" element={<Guard permission="dashboard"><DashboardPage /></Guard>} /><Route path="/products" element={<Guard permission="products"><ProductsPage /></Guard>} /><Route path="/pos" element={<Guard permission="pos"><PosPage /></Guard>} /><Route path="/sales" element={<Guard permission="sales"><SalesPage /></Guard>} /><Route path="/customers" element={<Guard permission="customers"><CustomersPage /></Guard>} /><Route path="/purchases" element={<Guard permission="purchases"><PurchasesPage /></Guard>} /><Route path="/expenses" element={<Guard permission="expenses"><ExpensesPage /></Guard>} /><Route path="/reports" element={<Guard permission="reports"><ReportsPage /></Guard>} /><Route path="/subscription" element={<Guard permission="settings"><SubscriptionPage /></Guard>} /><Route path="/settings" element={<Guard permission="settings"><SettingsPage /></Guard>} /><Route path="/admin" element={<Guard permission="admin"><AdminPage /></Guard>} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Route></Routes>
}

function Application() {
  const { user, shop, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <AuthPage />
  if (user.role === 'super_admin') return <Routes><Route path="/admin" element={<AdminPage />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes>
  if (!shop || user.role === 'unassigned') return <OnboardingPage />
  return <DataProvider><Workspace /></DataProvider>
}

export default function App() {
  return <AuthProvider><Application /><Toaster position="top-right" richColors closeButton /></AuthProvider>
}
