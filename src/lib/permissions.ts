import type { Role } from '@/types'

export type Permission = 'dashboard' | 'products' | 'pos' | 'sales' | 'customers' | 'purchases' | 'expenses' | 'reports' | 'settings' | 'admin'

const access: Record<Permission, Role[]> = {
  dashboard: ['owner', 'manager', 'cashier'],
  products: ['owner', 'manager'],
  pos: ['owner', 'manager', 'cashier'],
  sales: ['owner', 'manager', 'cashier'],
  customers: ['owner', 'manager', 'cashier'],
  purchases: ['owner', 'manager'],
  expenses: ['owner', 'manager'],
  reports: ['owner', 'manager'],
  settings: ['owner'],
  admin: ['super_admin'],
}

export const can = (role: Role, permission: Permission) => access[permission].includes(role)
