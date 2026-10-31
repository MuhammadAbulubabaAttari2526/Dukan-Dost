# Remaining limitations and infrastructure costs

## Not implemented or not yet production-verified

- **Offline billing:** not available. The UI does not promise offline sales. A future implementation needs IndexedDB, a durable transaction queue, conflict handling, synchronization and idempotent server processing.
- **Payment gateway:** not integrated. Subscription activation is manual and authorized; no payment is simulated.
- **Supplier payable ledger:** supplier directory and purchases exist, but supplier balances/payments are not inferred or maintained.
- **Partial-line returns:** the audited workflow returns the entire sale. Item-level returns require additional quantity/refund policy and tests.
- **Live scale pagination:** live subscriptions read at most 500 recent documents per collection and tables paginate client-side. Before high-volume use, replace these with server-side cursors, bounded date queries and report aggregation.
- **Logo storage:** settings accept an HTTPS logo URL; file upload/storage is not included.
- **Tax compliance:** reports are operational estimates, not audited books, tax returns, fiscal invoices or jurisdiction-specific accounting.
- **Live Firebase verification:** no Firebase project/credentials were supplied. Source and unit/build checks are verified; deployed Auth, rules, Functions, App Check, IAM and backup/restore still require project-level testing.
- **Deletion automation:** retention policy is documented, but legal/accounting review and a tested shop-deletion workflow are still needed.
- **Demo persistence:** demo mode is intentionally session-only and resets on reload. Live mode uses Firebase; demo mode is not a fallback database.

## Expected infrastructure cost categories

Costs are usage- and region-dependent; no current price or free-tier eligibility is guaranteed here. Review Firebase/GCP pricing and set budget alerts before launch.

- **Firebase Authentication:** email/password usage and any optional phone/App Check providers have different quotas and pricing.
- **Cloud Firestore:** document reads, writes, deletes, stored data, indexes, network egress and backup exports. Dashboard/report subscriptions and per-user rate counters contribute reads/writes.
- **Cloud Functions:** invocations, compute time, memory, networking and minimum-instance settings. This MVP uses no configured minimum instances and caps function instances.
- **Firebase Hosting:** stored assets and download bandwidth.
- **Cloud Storage / backup:** export storage, retention, operations and restore egress.
- **Observability:** Cloud Logging, Error Reporting, monitoring and alert retention.

A small pilot will usually be dominated by Firestore read/write volume and report refresh behavior. Control cost by using bounded date queries, cursor pagination, aggregated reporting, appropriate listener lifetimes, log retention, function instance caps and budget alerts. The proposed PKR 499/999 subscription prices are product pricing, not an estimate of Firebase infrastructure cost.
