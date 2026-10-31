import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { createShop, updateShopProfile, assignMember } from './shop.js'
export { saveProduct, importProducts, archiveProduct, adjustStock } from './catalog.js'
export { createSale, returnSale, recordCustomerPayment } from './sales.js'
export { addCustomer, addSupplier, addExpense, createPurchase, confirmPurchase } from './operations.js'
export { updateShopAdmin, adminListShops } from './admin.js'
