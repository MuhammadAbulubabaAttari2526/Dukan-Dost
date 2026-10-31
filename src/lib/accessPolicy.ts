import type { Shop } from '@/types'

export function canWriteBusiness(shop: Pick<Shop, 'status' | 'subscriptionStatus' | 'renewalDate'>, now = new Date()) {
  return shop.status === 'active'
    && ['trial', 'active'].includes(shop.subscriptionStatus)
    && new Date(shop.renewalDate).getTime() >= now.getTime()
}
