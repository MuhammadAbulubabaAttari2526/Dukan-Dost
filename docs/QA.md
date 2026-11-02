# QA checklist and verification status

## Automated commands

Run from the repository root:

```powershell
npm run lint
npm test
npm run build
npm run api:build
npm run api:test
npm run api:test:integration
```

The integration command starts an in-memory MongoDB replica set and may download a MongoDB binary on first use. Integration tests were not run as part of the current validation because the download previously exhausted the available time/disk budget. Do not treat build or unit-test success as a substitute for transaction integration coverage.

## Manual checks before a pilot

- [ ] Create account and shop; sign out/in and verify session restoration.
- [ ] Verify owner, manager and cashier access against API responses, not just hidden UI links.
- [ ] Verify one user cannot access another shop's products, ledger, sales or audit records.
- [ ] Verify an unauthenticated caller and a super-admin are rejected by tenant-only routes.
- [ ] Verify concurrent sale retries with the same idempotency key create one sale and one stock deduction.
- [ ] Verify the final item-line totals equal the sale total after discount rounding.
- [ ] Test partial returns, full return, repeated return and concurrent return requests.
- [ ] Verify customer and supplier balances reconcile with their ledgers after payments and returns.
- [ ] Verify imports reject duplicate SKUs and do not partially commit invalid rows.
- [ ] Verify a revoked session and password change invalidate already-issued access tokens.
- [ ] Verify expiry/suspension blocks business writes and remains visible to authorized members.
- [ ] Check 375px mobile and desktop layouts, keyboard navigation, loading/error states and receipt printing.
- [ ] Configure production reset-email delivery, backup monitoring and complete an isolated restore drill.

## Current validation record

Frontend production build, API TypeScript build, ESLint, frontend unit suite, and API unit suite have passed in this work session. Mongo replica-set integration, deployed API, email delivery, backups and responsive browser QA remain unverified.
