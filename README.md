# Dukaan Dost

Dukaan Dost is a multi-tenant retail operations application for small shops. The React/Vite frontend is at the repository root; the Node.js 20+, Express, TypeScript and MongoDB API is `apps/api`. MongoDB replica-set transactions are required for writes that affect inventory, sales or ledgers. Monetary values are stored as integer paisa.

## Requirements

- Node.js 20 or later and npm
- Docker Desktop (or another MongoDB replica-set deployment)

## Local development

```powershell
npm install
docker compose up -d
Copy-Item apps/api/.env.example apps/api/.env
npm run api:indexes
npm run api:dev
```

In another terminal:

```powershell
npm run dev
```

The frontend is served at `http://localhost:3000`; the API is served at `http://localhost:4000/api/v1`. Vite proxies `/api` during local development. Set `VITE_API_URL` in the root `.env` only when the API has a different origin. Configure the API's allowed frontend origins in `apps/api/.env`.

Create a regular account through the app and then create its shop. For an isolated seeded shop, first register a separate, unassigned account and run this before creating another shop:

```powershell
$env:ALLOW_DEMO_SEED = "true"
$env:DEMO_OWNER_EMAIL = "owner@example.com"
npm run seed:demo
```

Super-admin rights are never available through public registration. Provision an existing account only from a trusted shell:

```powershell
$env:CONFIRM_SUPER_ADMIN = "true"
$env:SUPER_ADMIN_EMAIL = "admin@example.com"
npm run create-super-admin
```

Re-authenticate that account after provisioning. Protect database credentials, JWT secrets and reset links; do not put secrets in frontend `VITE_*` variables or source control.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the frontend |
| `npm run api:dev` | Start the API with watch mode |
| `npm run build` | Type-check and build the frontend |
| `npm run api:build` | Compile the API |
| `npm test` | Run frontend unit tests |
| `npm run api:test` | Run API unit tests |
| `npm run api:test:integration` | Run API/Mongo replica-set integration tests |
| `npm run lint` | Lint the repository |

Integration tests use `MongoMemoryReplSet`; its MongoDB binary may need a sizeable first download. Set `MONGOMS_SYSTEM_BINARY` to an already installed MongoDB binary when available. They are intentionally separate from the default, download-free test command.

## Architecture and documentation

- [docs/API.md](./docs/API.md) — API routes and authentication behavior
- [docs/SCHEMA.md](./docs/SCHEMA.md) — collections, money and transaction boundaries
- [docs/SECURITY.md](./docs/SECURITY.md) — tenant authorization, sessions and operational controls
- [docs/QA.md](./docs/QA.md) — repeatable validation and manual release checklist
- [docs/LIMITATIONS.md](./docs/LIMITATIONS.md) — known gaps and unverified deployment requirements

## Delivery status

The frontend and API production builds, repository lint, frontend unit tests and API unit tests have been run successfully during this migration. MongoDB replica-set integration tests and live deployment have **not** been verified in this environment. The feature set is still incomplete: see the limitations document before using this for real business records. This is not tax-compliant accounting software, and the demo mode is session-only.
