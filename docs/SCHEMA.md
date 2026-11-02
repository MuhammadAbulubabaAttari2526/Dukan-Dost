# MongoDB schema and accounting boundaries

## Storage conventions

- Every shop-owned business record stores `shopId: ObjectId`; tenant-scoped reads and writes must include the authenticated, membership-validated shop id.
- Monetary values are integer paisa fields ending in `Paisa`. API serialization converts them to decimal PKR numbers for the existing UI. Convert input amounts with `toPaisa`; do not store floating-point currency.
- Counts and inventory quantities are integers. Dates are stored as BSON dates and displayed in Asia/Karachi time.
- MongoDB transactions require a replica set. The local Docker Compose file initializes `rs0`.

## Collections

| Collection | Key data and purpose |
|---|---|
| `users` | Email-unique identity, Argon2id password hash, disabled state, super-admin flag and `tokenVersion` |
| `memberships` | Shop/user/role and active state; partial unique index prevents one user having multiple active shops |
| `shops` | Profile, active/suspended state, plan, subscription status and renewal date |
| `products` | Shop-local SKU, price/cost in paisa, stock, archive state and low-stock threshold |
| `sales` | Receipt counter, immutable item snapshots, total/discount/payment and cashier |
| `returns` | Return lines, refund amount and reference to original sale |
| `customers` | Shop-local customer information |
| `ledgerEntries` | Signed customer balance events; positive is amount owed, negative is payment/credit |
| `payments` | Sale receipt, customer payment, refund and supplier payment records |
| `suppliers` | Shop-local supplier contact record |
| `purchases` | Supplier invoice, item snapshots, paid amount and draft/confirmed state |
| `supplierLedger` | Purchase payable and supplier payment entries |
| `expenses` | Operating expense records, separate from inventory purchases |
| `stockMovements` | Signed stock changes and their reason/reference |
| `subscriptions` | Append-only plan/status history for a shop |
| `idempotencyKeys` | Shop-scoped request hash and stored response; TTL expiry is 30 days |
| `auditLogs`, `adminAuditLogs`, `authAuditLogs` | Shop, privileged-admin and authentication activity |
| `refreshTokens` | Hashed refresh credential, CSRF-token hash, session family and revocation state |
| `passwordResetTokens` | Hashed, expiring, single-use reset token |

Product and sale line snapshots preserve historical names, SKU, price and cost when catalog values later change. Sale item counts and import batches are bounded. Unique indexes enforce per-shop SKU, receipt, purchase invoice and idempotency key constraints.

## Transaction boundaries

Transactions are used for sale and return operations, stock adjustments, product imports, purchase confirmation and account/shop creation. Related stock movement, customer/supplier ledger, payment and audit entries are written in the same transaction where applicable. All database queries that touch shop data must include `shopId`.

## Accounting interpretation

- Customer balance is calculated from ledger entries; it is not an independently editable customer field.
- Purchase confirmation increases stock and records supplier payable. Supplier payment reduces that payable.
- Operating expenses exclude inventory purchases to prevent double counting.
- Reports are operational estimates. They do not model tax, accounting period close, inventory write-offs or all return-period accounting policies.

## Index management

Run `npm run api:indexes` after setting up the API environment. Index creation is idempotent. Review index changes for existing production data before deployment; unique indexes can fail if historical records violate the constraint.
