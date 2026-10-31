# Manual QA checklist

Record browser/device, Firebase project/emulator, test account role, date, result and evidence for each run. Do not use production customer data for destructive tests.

## Authentication and onboarding

- [ ] Sign up with invalid email, short password and mismatched confirmation; useful errors appear.
- [ ] Create a valid account; profile starts unassigned with no shop.
- [ ] Create a shop; owner membership, trial and subscription history are created.
- [ ] Log out/in; the same shop loads. Reset-password email flow works.
- [ ] Public profile update cannot change role, shopId or custom claims.
- [ ] Owner assigns manager/cashier to an existing account; role takes effect after membership update.
- [ ] Only a provisioned custom-claim account can access super-admin functions.

## Tenant isolation and roles

- [ ] Shop A owner/manager/cashier cannot read Shop B products, customers, sales or ledger.
- [ ] Direct Firestore writes to products, sales, payments, members and subscriptions are denied.
- [ ] Cashier can bill but cannot open product, purchase, expense, report or admin routes.
- [ ] Cashier discount above 5% and manager discount above 20% fail server-side.
- [ ] Expired/suspended shops can read/export but cannot complete business writes.

## Products and inventory

- [ ] Add/edit/search/filter/archive products; validation and duplicate-SKU errors are clear.
- [ ] Editing a product cannot silently change stock.
- [ ] Positive/negative adjustments create movement records; negative resulting stock is rejected.
- [ ] Import valid CSV with quoted fields; reject malformed rows and duplicate SKUs without partial import.
- [ ] Export filtered products and verify values in a spreadsheet.
- [ ] Low-stock notification and filter match current stock/threshold records.

## POS and sales

- [ ] Search by product name, SKU and barcode; Enter adds first result.
- [ ] Quantity cannot exceed stock; removal and clear-cart work.
- [ ] Cash, digital and credit totals, amount paid, change and balance due are correct.
- [ ] Credit sale without customer is blocked; partial credit payment updates customer ledger.
- [ ] Double-click/retry the same checkout; only one sale and one stock deduction occur.
- [ ] Refresh after completion; sale, snapshots, payment and stock movements persist in live mode.
- [ ] Print and reprint an 80mm receipt; only receipt content prints.
- [ ] Full return restocks once, records refund/credit reversal and preserves original receipt history.

## Customers and udhar

- [ ] Add customer and complete credit sale; outstanding equals ledger sum.
- [ ] Record full and partial payments; duplicate submission has no additional effect.
- [ ] Overpayment and payment without outstanding balance are rejected.
- [ ] Customer statement running balance and final balance reconcile; print layout is readable.
- [ ] Return of credit sale reverses only the applicable outstanding amount.

## Purchases, suppliers and expenses

- [ ] Add supplier; create multi-line draft purchase with server-recalculated total.
- [ ] Draft does not change stock. Confirm updates stock/cost and movements exactly once.
- [ ] Repeat confirmation and duplicate supplier invoice are rejected.
- [ ] Record operating expense; inventory purchase is not duplicated as expense.
- [ ] Daily/weekly/monthly filters and CSV export match the same records.

## Reports and subscription

- [ ] Today/yesterday/7-day/30-day/custom boundaries use Asia/Karachi.
- [ ] Net sales, COGS, gross profit and operating result reconcile to sampled receipts/expenses.
- [ ] Returns affect net sales and COGS consistently in the selected return period.
- [ ] Stock valuation, low stock, product performance, credit and purchase exports match UI.
- [ ] Super admin changes plan/status/suspension; subscription history and audit log append.
- [ ] No payment success is shown without a provider confirmation.

## Desktop visual and keyboard QA

- [ ] Test 1024px and 1440px widths; sidebar, tables, dialogs and POS cart do not overlap.
- [ ] All controls have hover/focus/active/disabled states; visible focus ring is present.
- [ ] Navigate forms/dialogs by keyboard; Escape/backdrop/close controls dismiss overlays.
- [ ] Loading, empty, success, validation, confirmation and server-error states are understandable.
- [ ] Browser console has no errors or failed asset requests; receipts print only intended content.

## Mobile visual and workflow QA

- [ ] Test 375px and 768px widths; no page-level horizontal scrolling or clipped controls.
- [ ] Mobile menu and bottom navigation reach every role-authorized route.
- [ ] Touch targets are at least 44px; POS add/quantity/payment/checkout works one-handed.
- [ ] Product forms, import controls, tables and customer statements remain usable; tables scroll internally where needed.
- [ ] Safe-area padding prevents bottom navigation from covering the final action.
- [ ] Screen-reader labels announce icon-only actions and validation errors.

## Release evidence

- [ ] `npm test` passes.
- [ ] `npm run functions:build` and `npm run build` pass.
- [ ] Emulator rules and transaction suites pass.
- [ ] Backup restore drill passes in an isolated project.
- [ ] Live Firebase Auth/rules/Functions smoke test passes in a disposable pilot shop.
