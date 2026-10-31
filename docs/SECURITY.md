# Security, access and recovery model

## Authorization layers

1. Firebase Authentication establishes the UID.
2. `shops/{shopId}/members/{uid}` establishes tenant membership and business role.
3. Callable functions re-check membership and allowed role on every privileged operation.
4. Shop status, subscription state and renewal date gate business writes.
5. Firestore rules allow shop reads only to members/claimed super-admins and deny all direct business writes.
6. Super-admin functions additionally require the Firebase Auth custom claim `superAdmin=true`.

Frontend route guards and hidden actions are usability controls only, not the security boundary. Public sign-up creates `unassigned` users. Shop creation assigns owner only to the authenticated creator during onboarding. Owners can assign manager/cashier to existing users; there is no public super-admin route.

## Data and secrets

Only public Firebase Web configuration belongs in `VITE_FIREBASE_*`. Admin SDK credentials must remain in trusted local/CI secret storage. Do not commit `.env`, service-account files, tokens, database exports or customer data. Cloud Functions return safe validation/business errors and do not expose Admin credentials.

## Transaction and abuse controls

- Authoritative product price/cost snapshots and server-recalculated totals
- Role-based discount ceilings: cashier 5%, manager 20%, owner full order value
- Nonnegative stock policy
- Idempotency records for sale and customer-payment requests
- Exactly-once draft purchase confirmation and full-sale return state transitions
- Per-UID fixed-window Firestore rate counters (stricter for onboarding/admin/import)
- Bounded strings, item counts, CSV size (100 rows), money and quantities
- Audit records for sensitive operations
- Explicitly authorized JSON/CSV export screens; Firestore cross-shop reads denied

For a public deployment, add Firebase App Check after validating your reCAPTCHA/provider configuration, monitor rate-limit rejection logs, and configure budget alerts. App Check is not falsely shown as enabled here.

## Expiry and suspension policy

Expired, cancelled, past-due and suspended shops cannot perform business writes. Their Firestore records are preserved and remain readable by authorized members. Owners retain profile, subscription and data-export access. A super admin can reactivate access or manually record a subscription renewal; no payment success is inferred by the UI.

## Backup procedure

Use Google Cloud’s managed Firestore export rather than exporting Admin credentials to the browser.

1. Create a dedicated, access-controlled Cloud Storage bucket in a compatible region with retention/object-lock policies appropriate to the business.
2. Schedule Firestore managed exports with Cloud Scheduler and a least-privilege service account. Include all collections; do not rely on client JSON exports as backups.
3. Encrypt bucket access, restrict public access, enable audit logging, and define a retention schedule with legal/accounting requirements.
4. Monitor export success and alert on failures. Test the scheduler initially and after permission changes.
5. Document the project, bucket, export prefix, schedule and recovery owner in the deployment runbook, not in source control.

Example command shape (run only with authorized gcloud credentials and your own values):

```bash
gcloud firestore export gs://YOUR_PRIVATE_BACKUP_BUCKET/YYYY-MM-DD \
  --project=YOUR_PROJECT_ID
```

## Restore drill

Run before a pilot and at least quarterly:

1. Export production to a new timestamped prefix.
2. Create an isolated non-production Firebase/GCP project. Never overwrite production during a drill.
3. Import the export into the isolated project using Firestore managed import.
4. Deploy the same rules/functions revision to the isolated project.
5. Verify record counts for shops, products, sales, payments, ledger, purchases and movements; reconcile sale totals, stock movements and customer ledger balances against a sampled pre-backup report.
6. Verify tenant A cannot read tenant B and that callable sale/payment idempotency works in the restored environment.
7. Record evidence, discrepancies, recovery time and the person who approved the drill.

A live cloud backup/restore drill was not run in this repository because no Firebase project or credentials were supplied. Do not claim recovery readiness until this drill passes.

## Pre-pilot security gates

- Run `npm test` and emulator integration suites with zero failures.
- Test role escalation, cross-shop reads/writes and expired-subscription writes against the deployed project.
- Review IAM, custom claims, API-key restrictions, App Check, Logging and budget alerts.
- Complete the backup restore drill and manual QA checklist.
- Treat the operational reports as estimates, not tax-compliant accounts.
