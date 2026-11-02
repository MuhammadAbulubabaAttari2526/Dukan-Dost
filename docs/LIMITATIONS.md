# Known gaps and deployment limitations

This migration is not yet a production-ready completion of the full product prompt. The API and frontend now use the MongoDB-backed API, but the following important work remains:

- MongoMemoryReplSet integration tests could not be run because first-time MongoDB binary download was too large/slow for the available environment. Critical transaction/concurrency paths need integration coverage.
- Password reset is single-use and hashed, but production email transport, email change/reverification and account verification are not implemented. Development reset tokens are logged.
- The frontend still loads bounded bootstrap pages and computes reports locally; server-side report aggregation, cursor-driven UI loading and complete data exports are needed for shops exceeding those limits.
- CSV parsing/row validation remains frontend-led; API bulk import validates JSON rows but does not parse a raw CSV upload.
- Partial returns are accepted by the API, but the UI only exposes the existing return workflow and has not been verified for item-level returns.
- Supplier ledger/payment endpoints exist, but supplier statements and payment workflows are not complete in the UI.
- Logo support is a URL only; no upload or storage pipeline is provided.
- Demo seeding creates limited sample records and is not a complete sample accounting dataset.
- Super-admin listing has a fixed 100-shop cap; production pagination, filters and stronger operational controls are needed.
- Data deletion/retention tooling, production observability, email service, TLS deployment, secrets management and backup/restore drills are not included.
- The UI still uses the repository-root frontend rather than a separate `apps/web` package. `apps/api` is an npm workspace.
- Reports are operational estimates, not audited books, tax returns or fiscal invoices. Offline billing and payment-gateway subscription activation are not supported.

No live deployment or Mongo replica-set integration run is claimed. Do not use this build for real business records until these gaps are addressed and release gates are completed.
