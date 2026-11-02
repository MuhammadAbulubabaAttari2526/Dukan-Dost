import type { ShopRole } from '../middleware/auth.js'

export type Permission =
  | 'dashboard' | 'products' | 'inventory' | 'pos' | 'sales' | 'customers'
  | 'purchases' | 'suppliers' | 'expenses' | 'reports' | 'settings' | 'members'

const permissions: Record<Permission, readonly ShopRole[]> = {
  dashboard: ['owner', 'manager', 'cashier'],
  products: ['owner', 'manager'],
  inventory: ['owner', 'manager'],
  pos: ['owner', 'manager', 'cashier'],
  sales: ['owner', 'manager', 'cashier'],
  customers: ['owner', 'manager', 'cashier'],
  purchases: ['owner', 'manager'],
  suppliers: ['owner', 'manager'],
  expenses: ['owner', 'manager'],
  reports: ['owner', 'manager'],
  settings: ['owner'],
  members: ['owner'],
}

export function roleCan(role: ShopRole, permission: Permission): boolean {
  return permissions[permission].includes(role)
}

export function rolesFor(permission: Permission): readonly ShopRole[] {
  return permissions[permission]
}
