import type { Role } from '@/types'

export type Permission = 'dashboard' | 'products' | 'pos' | 'sales' | 'customers' | 'purchases' | 'expenses' | 'reports' | 'settings' | 'admin'

const access: Record<Permission, Role[]> = {
  dashboard: ['owner', 'manager', 'cashier', 'super_admin'],
  products: ['owner', 'manager', 'super_admin'],
  pos: ['owner', 'manager', 'cashier', 'super_admin'],
  sales: ['owner', 'manager', 'cashier', 'super_admin'],
  customers: ['owner', 'manager', 'super_admin'],
  purchases: ['owner', 'manager', 'super_admin'],
  expenses: ['owner', 'manager', 'super_admin'],
  reports: ['owner', 'manager', 'super_admin'],
  settings: ['owner', 'super_admin'],
  admin: ['super_admin'],
}

export const can = (role: Role, permission: Permission) => access[permission].includes(role)
