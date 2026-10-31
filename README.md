# Dukaan Dost

A responsive, multi-tenant shop-management SaaS for general stores, kiryana shops and stationery shops in Karachi. React + Vite + TypeScript frontend, Firebase Authentication, shop-scoped Cloud Firestore, and trusted Cloud Functions for business writes.

## What is implemented

- Email/password sign-up, login, logout, password reset, protected routes and shop onboarding
- Owner, manager, cashier and explicitly claimed super-admin roles; owner-led member assignment
- Dashboard with date filters, actual sales/COGS/gross-profit/expense/operating-result calculations, low stock, udhar, recent sales and product rankings
- Products, duplicate-SKU checks, archive, search/filter, stock adjustments, movement history, validated CSV import and CSV export
- POS with name/SKU/barcode search, cart, role-limited discounts, cash/digital/credit sales, customer selection, idempotent checkout and printable/reprintable receipts
- Full-sale returns with restocking, credit reversal and refund records
- Customers, ledger-derived udhar, partial/full payments, duplicate-payment protection and printable statements
- Suppliers, draft purchases, exactly-once confirmed stock-in and supplier-invoice duplicate checks
- Operating expenses and sales/product/stock/credit/purchase/expense reports with CSV export
- Starter/Business subscriptions, trial/active/past-due/expired/cancelled states, history, manual super-admin controls and shop suspension
- Strict Firestore rules, callable functions, server-side validation, audit logs, rate limits, indexes, emulator tests and demo seed tooling

## Important runtime distinction

**Live mode** uses Firebase Authentication, Firestore and Cloud Functions. It requires your Firebase configuration and deployed backend.

**Demo mode** is explicitly labeled in the interface. It uses realistic sample records in memory for the current session only. It does not use `localStorage`, does not persist across reloads, and never claims cloud persistence. Demo data is not mixed into a live Firebase shop.

## Local setup

Prerequisites: Node.js 20, npm, a Firebase project, and Firebase CLI (`npm install -g firebase-tools`). Cloud Functions deployment requires a Blaze-enabled project; local emulation does not incur cloud Functions charges.

1. Install frontend and shared test dependencies:

   ```bash
   npm install
   cp .env.example .env
   ```

2. In Firebase Console:
   - Create a Web App and copy its public configuration into `.env`.
   - Enable **Authentication → Sign-in method → Email/Password**.
   - Create **Cloud Firestore** in an appropriate region.
   - Ensure Cloud Functions can use the `asia-south1` region, or change the region consistently in `src/lib/firebase.ts` and `functions/src/*`.

3. Start the frontend:

   ```bash
   npm run dev
   ```

4. Create an account. Public sign-up creates only an `unassigned` user. Shop onboarding creates the shop and owner membership through `createShop`; no public owner or super-admin registration exists.

5. Deploy the backend before using live writes:

   ```bash
   npm --prefix functions install
   npm --prefix functions run build
   firebase login
   firebase use YOUR_PROJECT_ID
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```

6. Deploy the frontend to Firebase Hosting if desired:

   ```bash
   npm run build
   firebase deploy --only hosting
   ```

## Super-admin provisioning

Super-admin access uses the Firebase Auth custom claim `superAdmin: true`, checked by Cloud Functions and Firestore rules. It is not a frontend role.

Using trusted Admin SDK credentials (for example, `GOOGLE_APPLICATION_CREDENTIALS` locally):

```bash
SUPER_ADMIN_UID=existing_auth_uid CONFIRM_SUPER_ADMIN=true node scripts/set-super-admin.mjs
```

The user must sign out and back in to refresh the token. Never put Admin SDK credentials or service-account JSON in `.env`, `VITE_*` variables, frontend code, or source control.

## Emulator development and integration tests

Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env`, then start:

```bash
firebase emulators:start
```

In another terminal:

```bash
npm test                 # 15 unit/business tests; no emulator required
npm run test:rules       # Firestore rules + Cloud Function transaction suites
```

The integration suites skip cleanly unless the relevant emulator environment variables are present. Functions integration tests also require `FIREBASE_AUTH_EMULATOR_HOST`.

## Explicit demo seed

For a disposable emulator or demo project, create an Auth user and run:

```bash
ALLOW_DEMO_SEED=true DEMO_OWNER_UID=auth_uid npm run seed:demo
```

Live seeding additionally requires `ALLOW_LIVE_DEMO_SEED=true`. The script uses the isolated shop ID `demo_seed_shop`, prefixes sample products with `DEMO`, and refuses to run without explicit flags. Do not seed production customer shops.

## Tests and verification

```bash
npm test
npm run functions:build
npm run build
```

Covered by unit tests: permissions, subscription write policy, product and CSV validation, sale totals, price/cost snapshots, stock limits, discount limits, duplicate sale prevention, partial payments, duplicate payments, returns, purchase stock-in, and profit calculations.

Emulator suites cover: shop-to-shop isolation, anonymous/member reads, direct-write denial, public role-escalation denial, sale idempotency, stock deduction and exactly-once purchase confirmation. See `docs/QA.md` for the manual desktop/mobile checklist.

## Architecture

- `src/app`: authentication and data providers; live Firestore subscriptions and demo adapter
- `src/features`: route-level business modules
- `src/services/demoOperations.ts`: deterministic, testable demo business operations
- `src/utils/business.ts`: shared frontend reporting and sale calculations
- `functions/src`: trusted shop, catalog, sale, operations and admin functions
- `firestore.rules`: default-deny tenant boundary; Admin SDK functions perform trusted writes
- `tests/unit`: business and schema tests
- `tests/integration`: emulator-only rules and transaction tests

See:

- `docs/SCHEMA.md` — collections, fields, validation, indexes, transactions and retention
- `docs/SECURITY.md` — authorization model, abuse controls, backup and restore drill
- `docs/QA.md` — manual QA checklist
- `docs/LIMITATIONS.md` — remaining limitations and infrastructure cost categories

## Delivery status

The source, frontend production build, Functions TypeScript compilation and unit tests are verified in this repository. A live Firebase project was not provided, so live deployment, live Authentication, production Security Rules and cloud backup/restore are **not claimed as verified**. Run the emulator suites and manual QA before a real-shop pilot. This is not presented as tax-compliant accounting software or guaranteed offline billing.
