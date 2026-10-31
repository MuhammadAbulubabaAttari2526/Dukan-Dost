# Database schema and transaction design

All monetary values are numeric PKR amounts, rounded to two decimals by trusted business logic. Quantities are integers. Trusted timestamps use Firestore server timestamps and are normalized to ISO strings at the client boundary. The UI formats them for `Asia/Karachi`.

## Top-level collections

### `users/{userId}`

Required: `name: string`, `email: string`, `role: unassigned|owner|manager|cashier|super_admin`, `createdAt: timestamp`. Optional: `shopId: string`, `updatedAt: timestamp`.

Ownership: the authenticated user can read their profile and update only `name`/`updatedAt`. Public creation is valid only for their own UID with `role=unassigned` and no `shopId`. Membership changes are performed by functions.

### `shops/{shopId}`

Required: `name`, `contact`, `address`, `status: active|suspended`, `plan: starter|business`, `subscriptionStatus: trial|active|past_due|expired|cancelled`, `renewalDate: timestamp`, `createdAt: timestamp`. Optional: `logoUrl`, `ownerId`, `updatedAt`.

Ownership: shop members read; functions write. Super-admin reads require the Auth custom claim.

### `rateLimits/{uid_action}`

Internal fixed-window abuse counters: `window: number`, `count: number`, `updatedAt`. Client rules deny access.

## Shop-scoped collections

Every document below lives under `shops/{shopId}` and is readable only by a member of that shop or an explicitly claimed super-admin. Client writes are denied; trusted functions use the Admin SDK.

### `members/{userId}`

`role: owner|manager|cashier`, `email: string`, `joinedAt: timestamp`. Membership is the tenant boundary. Owner onboarding and `assignMember` are the only role-assignment paths.

### `products/{productId}`

Required: `name`, `sku`, `category`, `unit`, `cost: number`, `price: number`, `stock: integer`, `lowStockThreshold: integer`, `archived: boolean`, `createdAt`, `updatedAt`. Optional: `supplierId`.

Validation: bounded non-empty strings, nonnegative finite money and stock, unique SKU per shop. Product edits preserve current stock; quantity changes require movements. Archived products remain available for historical snapshots but not POS.

### `sales/{saleId}`

Required: `receiptNumber`, `items: SaleItem[]`, `subtotal`, `discount`, `total`, `amountPaid`, `balanceDue`, `paymentMethod: cash|digital|credit`, `status: completed|returned|cancelled`, `createdAt`, `createdBy`, `idempotencyKey`. Optional nullable: `customerId`, `customerName`, `returnedAt`, `returnedBy`.

`SaleItem`: `id`, `productId`, `name`, `sku`, `unit`, `unitPrice`, `cost`, `quantity`. Price, cost, name and SKU are authoritative product snapshots.

**Schema reasoning:** items are a bounded array (1–100 lines) on the sale rather than a separate subcollection. This keeps receipt reads and the sale/stock transaction atomic and avoids eventual consistency between a sale and its items. The 100-line server limit also bounds document size. Completed sales are never silently edited; a full return updates status and adds reversal records.

### `payments/{paymentId}`

`customerId?: string`, `saleId?: string`, `amount: positive number`, `method: cash|digital`, `type: sale|credit_payment|refund`, `idempotencyKey`, `createdAt`. Refunds use deterministic IDs derived from the sale to prevent repetition.

### `customers/{customerId}`

`name`, optional `phone`, `createdAt`. No arbitrary balance field is stored.

### `ledger/{entryId}`

`customerId`, `type: credit_sale|payment|return|adjustment`, signed `amount`, optional `referenceId`, `note`, `createdAt`. Debits are positive and credits negative. Outstanding balance is `sum(amount)` across the customer ledger.

### `suppliers/{supplierId}`

`name`, `contact`, `phone`, `createdAt`. Supplier payable balances are not implied.

### `purchases/{purchaseId}`

`supplierId`, `supplierName`, `invoiceNumber`, `items: PurchaseItem[]`, `total`, `status: draft|confirmed|cancelled`, `paymentStatus: unpaid|partial|paid`, `createdAt`, optional `confirmedAt` and `confirmedBy`.

`PurchaseItem`: `productId`, `name`, `quantity`, `unitCost`. Authorized invoice costs are validated and totals recalculated server-side. Only `draft → confirmed` triggers stock-in.

### `expenses/{expenseId}`

`title`, `category`, `amount`, `date: YYYY-MM-DD`, `paymentMethod: cash|digital`, optional `note`, `createdAt`. Inventory purchases must not be duplicated here.

### `stockMovements/{movementId}`

`productId`, `productName`, `type: opening|purchase|sale|adjustment|return`, signed integer `quantity`, `reason`, optional `referenceId`, `createdAt`. Every quantity mutation has a corresponding movement in the same transaction/batch.

### `requests/{idempotencyKey}`

`operation: sale|customer_payment`, `saleId` or `paymentId`, `createdAt`. The request record and business records commit atomically. A repeated key returns the original result or no-ops without duplicate stock/payment effects.

### `subscriptions/{subscriptionId}`

`plan`, `status`, `startDate`, `renewalDate`, `note`. New administrative plan/status changes append a record; shop subscription fields are the current projection.

### `auditLogs/{logId}`

`action`, `actor`, `detail`, `createdAt`. Sensitive operations and privileged admin actions append audit entries.

## Indexes

`firestore.indexes.json` defines indexes for product SKU/archive, sales status/date, supplier invoice uniqueness checks, purchase status/date, customer ledger date, product movement date and expense date. Single-field queries use Firestore’s automatic indexes. The browser currently reads bounded collections and paginates locally; production scale should move to cursor queries (see limitations).

## Referential integrity

Firestore does not enforce relational constraints. Functions therefore:

- re-fetch shop membership and shop status before writes;
- re-fetch products, customers, suppliers and purchases inside transactions;
- reject cross-shop references because all document paths are derived from the authorized `shopId`;
- preserve historical sale snapshots if product prices later change;
- archive products instead of deleting records referenced by sales.

## Transaction boundaries

- **Sale:** request key + products + customer read; sale, stock updates, movements, payment, ledger, request and audit commit atomically.
- **Customer payment:** request key + customer + ledger read; payment, ledger credit, request and audit commit atomically.
- **Purchase confirmation:** purchase + products read; status, stock/cost, movements and audit commit atomically.
- **Return:** sale + products read; status, restocking, movements, ledger/refund and audit commit atomically.
- **Product save/adjustment:** product/SKU reads; product, movement and audit commit atomically.
- **CSV import:** maximum 100 products per batch; all rows validated before a single batch commit.

## Retention and deletion

MVP policy: retain business records while the shop account is active and after subscription expiry. No hard-delete UI is provided for sales, stock movements, payments, credit ledger or audit logs. Product archival preserves history. Account/shop deletion and retention schedules require an explicit owner request, a super-admin-reviewed runbook, legal review, export confirmation, and a tested deletion job before being enabled. Demo session data disappears on reload and is not cloud retention.
