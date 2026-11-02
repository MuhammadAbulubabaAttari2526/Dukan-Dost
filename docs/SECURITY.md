# Security and recovery

## Authentication and authorization

- Accounts use Argon2id password hashes and short-lived bearer access tokens. Refresh credentials are opaque, HttpOnly cookies; refresh rotation uses a separate CSRF cookie/header check.
- Refresh tokens are stored as hashes. Access tokens carry a session family id and a user token version; revoking a session or changing a password invalidates the associated access token on the next request.
- Shop membership and role are checked server-side on every tenant route. All shop queries are scoped to the validated `shopId`; the frontend route guards are UX only.
- Super-admin endpoints require a provisioned database flag and do not accept tenant routes. Provision with `npm run create-super-admin` from an authorized environment and audit every administrative mutation.
- Public registration cannot specify a role or shop membership.

## Business integrity controls

- Zod request validation, bounded lists, CORS allow-list, Helmet, authentication rate limiting and structured Pino logs.
- Server-calculated price, cost, totals, discount limits and inventory availability.
- Mongo transactions for core inventory/accounting mutations and shop-scoped idempotency for sale, return and payment operations.
- Shop suspension and subscription expiry block business writes; records remain retained.
- Data export is authenticated and limited to the currently loaded UI records; it is not a complete database backup.

## Secrets and deployment

Keep MongoDB credentials and JWT secrets in an approved secret manager or protected environment file. Production must use explicit high-entropy JWT secrets and secure cookies. Use HTTPS, configure `CORS_ORIGINS` to exact trusted origins, restrict database network access, and run MongoDB with authentication and TLS in a managed production deployment. Never commit `.env`, reset tokens, customer data or database exports.

The development password-reset path logs the reset token to the API logger (with token redaction configured). No production email transport is included yet, so password-reset delivery must be implemented and verified before production onboarding.

## Backup and restore

Use MongoDB's managed backup or an authorized `mongodump`/`mongorestore` process with encrypted, access-controlled storage, retention policy and monitoring. Exclude credentials from the backup artifact. A backup is not proven until restored into an isolated replica set and checked for shop, sale, stock, payment, ledger and audit consistency. No production backup or restore drill has been run for this project.

## Pre-production gates

- Run all unit and replica-set integration tests and complete the manual QA checklist.
- Review CORS, proxy, cookie, rate-limit, logging, secret and database network settings.
- Implement and exercise production password-reset email delivery.
- Run a restore drill and reconcile a sample shop's sales, stock and ledgers.
- Perform an independent security review and resolve its findings before storing real customer data.
