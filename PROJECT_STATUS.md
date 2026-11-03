# Project Status

**Assessed:** 2026-11-03  
**Scope:** Repository source, schema and committed migrations, documentation, tests, local builds, and a Docker image build. No database-backed application was available; the Docker Compose CLI is missing, so Compose deployment was not tested.

**Session implementation update:** the initial assessment found that institution administrators could assign and revoke memberships but could not edit an existing role/campus assignment. This session added that workflow, audit logging, self-edit/last-administrator safeguards, and unit coverage. The updated checks below include this change.

## Architecture and technology

The project is a modular-monolith baseline: Next.js App Router pages and Route Handlers, reusable server-side domain/authentication helpers, Prisma data access, and MySQL. The UI currently uses one client-side operations component rather than role-specific application shells. There is no worker, separate domain package, API specification, or integration adapter.

The locked stack is Next.js 16.4.3, React 19.3.1, TypeScript 7.0.2, Prisma 7.10.1 with the MariaDB/MySQL adapter, and MySQL 8.4 in Compose. Tests use Node's test runner through `tsx`; no UI, integration, or browser-test framework is configured. Styling is custom CSS.

## Release status

| Release | Status | Repository evidence and remaining acceptance work |
|---|---|---|
| 1 — Foundation | **PARTIAL** | `src/app/api/v1/auth/*`, `memberships`, and `campuses` implement one-time first-institution bootstrap, hashed sessions, password changes, membership assignment/edit/revocation, campus records, and role checks. Membership edits prevent self-lockout and removal of the final administrator and write an audit event. `prisma/schema.prisma` contains institution-scoped relations and composite campus constraints. Additional institution onboarding, invitations/recovery, dashboard shells, and automated database-backed tenant/authorization tests are absent. The two-institution acceptance criterion is **UNVERIFIED**. |
| 2 — Daily operations | **PARTIAL** | Ingredient/store APIs and inventory movement/balance paths exist. Movements transactionally update balances, append ledger rows, and add audit events; current stock exposes reorder indicators. Stock batches/expiry, recipe versions, menus, demand calculations, shortage/expiry alerts, and the complete kitchen workflow are absent. |
| 3 — Purchasing | **NOT IMPLEMENTED** | No supplier, quotation, request/order, approval, goods-receipt, invoice, allocation, or transfer modules exist. |
| 4 — Operational accountability | **NOT IMPLEMENTED** | No production runs, waste records, budgets, cost-per-meal reporting, consolidated dashboards, or report exports exist. |
| 5 — Deployment readiness | **PARTIAL** | `Dockerfile`, `compose.yaml`, Prisma migrations, and liveness/readiness routes provide a deployment baseline. The production Docker image builds, starts, and responds from its liveness route. Compose operation could not be tested because the Compose CLI is unavailable; migration application, backup/restore, rollback, cloud configuration, worker operation, OpenAPI, and load/security/isolation deployment tests remain unverified or absent. |
| 6 — Expansion | **NOT IMPLEMENTED** | Forecasting, supplier comparisons, SSO, accounting/hostel integrations, QR attendance, and offline operation are absent. |

## Implemented and connected paths

- Authentication resolves a hashed opaque session to a user and membership; password changes revoke other sessions. State-changing routes check same-origin requests.
- Membership role and campus scope checks are applied in the inspected APIs. Institution-owned inventory reads and writes include the authenticated institution; composite foreign keys constrain campus/store/ingredient relationships.
- Inventory receipt/issue/waste/adjustment paths connect the UI, API, Prisma schema, transaction, maintained balance, immutable movement record, and audit event.
- First-run setup connects the UI to a single-use bootstrap endpoint and creates the first institution, campus, administrator, store, session, and audit event transactionally.
- The UI provides setup/sign-in/password-change, campus/store/ingredient creation, membership add/edit/revoke, stock movement entry and paginated movement history, and an inventory table. It is not yet a workflow-driven multi-module application.

These are source-level findings, not claims that database-backed user workflows were exercised in this assessment.

## Security, UX, and technical debt

**Tenant isolation:** application queries inspected are scoped by the session's institution, campus restrictions are checked for campus-scoped memberships, and composite foreign keys reinforce tenant integrity. This is a credible baseline, not a verified security guarantee: the suite has only pure unit tests and no database-backed cross-tenant/cross-campus authorization tests. There is no idempotency support for critical writes.

**Authentication and audit:** passwords use `scrypt`; sessions store SHA-256 token hashes and use `HttpOnly`, `SameSite=Lax` cookies; login attempts are rate-limited through account lockout. Stock and selected setup/access changes are audited. Email-based invitation/recovery, configurable permissions, and full audit coverage are absent.

**UI/UX:** the visual foundation is responsive and consistent at a basic level, with forms, status labels, empty inventory messaging, and a horizontally scrollable table. Navigation, role-specific dashboards, filters, transaction history, loading states, richer success/error semantics, keyboard/accessibility verification, and the kitchen/procurement workflows are missing. The component in `src/components/operations.tsx` combines most user operations in one file.

**Known defects:** no reproducible application bug was confirmed during this source review. The highest risks are unverified database/runtime behavior, absent integration and authorization coverage, and incomplete product workflows—not verified runtime failures.

## Verification performed

- `npm test` — **PASS**, 7 unit tests.
- `npm run typecheck` — **PASS**.
- `npx prisma validate` — **PASS**.
- `npm run build` — **PASS**, optimized Next.js production build.
- `docker build --tag ukms-validation:local .` — **PASS**, production container image build.
- Started the production container and requested `/api/health/live` — **PASS**, returned `{"status":"live"}`.
- Database migrations, tenant-isolation flows, API integration, end-to-end behavior, Compose deployment, restore/rollback, and responsive browser behavior — **NOT RUN**; the available tests do not cover them, no configured test database was used, and the Compose CLI is unavailable.

## Priority remaining work

1. Add database-backed tenant/campus authorization and transaction tests; verify bootstrap, membership changes, and inventory operations across two institutions.
2. Complete remaining Release 1 onboarding/invitation decisions and dashboard shells.
3. Implement Release 2 stock batches/expiry, recipes, menus, demand calculation, shortage detection, and the kitchen workflow.
4. Build central/local procurement and receiving, then production, waste, financial reporting, and exports.
5. Add idempotency for critical operations and comprehensive audit coverage as workflows are introduced.
6. Verify cloud/self-hosted deployment, migrations, backup/restore, and operational procedures; then add integrations and analytics.

## Run locally

Use Node.js 22.15+, MySQL 8.4, and the configuration instructions in `README.md`:

```sh
npm ci
cp .env.example .env
# Set independent MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD, BOOTSTRAP_TOKEN values,
# and DATABASE_URL as documented in README.md.
docker compose up -d db
npm run db:migrate
npm run dev
```

For code checks: `npm test`, `npm run typecheck`, `npx prisma validate`, and `npm run build`.
