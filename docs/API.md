# API overview

Base path: `/api/v1`. JSON success responses use `{ "data": ... }`; paged lists may also include `meta`. Errors use `{ "error": { "code", "message", "details?" } }`. Authenticated requests send `Authorization: Bearer <access-token>`.

## Authentication

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create unassigned account |
| POST | `/auth/login` | Sign in and issue access/refresh session |
| POST | `/auth/refresh` | Rotate refresh cookie; requires `x-csrf-token` matching `dd_csrf` |
| POST | `/auth/logout` | Revoke current refresh session |
| POST | `/auth/logout-all` | Revoke all sessions |
| POST | `/auth/forgot-password` | Request reset; currently development logger delivery only |
| POST | `/auth/reset-password` | Consume a one-time reset token |
| GET/PATCH | `/auth/me` | Read/update account name |
| POST | `/auth/change-password` | Change password and revoke sessions |
| GET/DELETE | `/auth/sessions[/:sessionId]` | List or revoke active sessions |

## Shop and business routes

- `POST /shops` creates a shop and owner membership.
- `GET /shops/:shopId` and `GET /shops/:shopId/bootstrap` read authorized shop data.
- `PATCH /shops/:shopId` updates profile. Owner-only subscription and audit history are under `/subscriptions` and `/audit`.
- `/shops/:shopId/members` supports owner-only list/create/update/remove.
- `/shops/:shopId/products` supports list/create/update, archive, stock adjustments, movement history and bounded JSON-row import.
- `/shops/:shopId/sales` supports paged sales, sale creation and partial/full returns. Sale, return and payment mutations require `Idempotency-Key`.
- `/shops/:shopId/customers`, `/suppliers`, `/purchases`, `/expenses` and related ledger/payment paths are implemented in the operations router. Sensitive reads/writes are role-checked.
- `/admin/shops` and `/admin/audit` are super-admin-only; admin shop mutations are audited.
- `/health` is liveness; `/ready` checks database readiness.

Every tenant path verifies active membership and shop status. See route schemas for exact request fields and bounds. Generated OpenAPI documentation and a stable, versioned external API contract have not yet been added.
