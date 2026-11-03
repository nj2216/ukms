# Project Status

**Assessed:** 2026-11-03  
**Scope:** Repository source, schema and committed migrations, documentation, unit tests, local builds, and temporary MySQL/browser verification. Docker Compose deployment was not tested because the Compose CLI is missing.

**Current implementation update:** the authenticated workspace now includes a first procurement slice: institution-scoped supplier directory, campus purchase requests, manager approval/rejection, purchase orders, and transactional partial/full goods receipt into batches, balances, movement history, and audit events. The fresh migration and core workflow were manually verified against temporary MySQL; procurement still lacks repeatable automated integration and tenant-isolation tests. Quotations, central purchasing/allocations, invoice reconciliation, production, finance, and reporting remain unimplemented.

## Architecture and technology

The project is a modular monolith: Next.js App Router pages and Route Handlers, reusable server-side domain/authentication helpers, Prisma data access, and MySQL. The authenticated UI uses an application shell with responsive sidebar, breadcrumbs, account and inventory-alert menus, plus dedicated overview, inventory, ingredient, movement, expiry, recipe/version, meal-plan/requirements, store, campus, and team-access pages. The original root page remains responsible for bootstrap, sign-in, and forced password changes. There is no worker, separate domain package, API specification, or integration adapter.

The locked stack is Next.js 16.4.3, React 19.3.1, TypeScript 7.0.2, Prisma 7.10.1 with the MariaDB/MySQL adapter, and MySQL 8.4 in Compose. Tests use Node's test runner through `tsx`; no UI, integration, or browser-test framework is configured. Styling is custom CSS.

## Release status

| Release | Status | Repository evidence and remaining acceptance work |
|---|---|---|
| 1 — Foundation | **PARTIAL** | `src/app/api/v1/auth/*`, `memberships`, and `campuses` implement one-time first-institution bootstrap, hashed sessions, password changes, membership assignment/edit/revocation, campus records, and role checks. Membership edits prevent self-lockout and removal of the final administrator and write an audit event. The protected application shell and role-aware administration pages exist. Temporary-MySQL checks confirmed a campus storekeeper sees only the assigned campus's stores and an institution administrator receives no foreign-campus menu/stock records across two institutions. Those checks are manual and limited to selected routes; comprehensive automated cross-tenant authorization tests, additional institution onboarding, invitations/recovery, and full dashboards are absent, so the two-institution acceptance criterion remains **PARTIAL/UNVERIFIED**. |
| 2 — Daily operations | **PARTIAL** | Ingredient/store APIs, aggregate stock balances, stock batches, expiry reporting, versioned recipes, campus meal plans, and ingredient requirement calculations connect to dedicated pages. Receipts create dated batches and ledger rows atomically; issues consume only non-expired lots in FEFO order, while waste/negative adjustments can consume expired stock. The dashboard and expiry page show scoped expired/expiring stock. Existing balances are migrated into opening batches with unknown expiry. Fresh/upgrade migrations were exercised on temporary MySQL; authenticated API checks verified split FEFO issues, recipe version history, pinned versions, exact demand aggregation, expired-stock exclusion, shortage calculation, and stock rollback. Recipe, menu, and expiry pages were browser-checked, including the 390px mobile layout. Production, waste records, reservations, transfer, and purchase actions remain absent. |
| 3 — Purchasing | **PARTIAL** | Added supplier, request, order, and receipt models with tenant-aware relations; `/api/v1/suppliers`, `/api/v1/purchase-requests`, `/api/v1/purchase-orders`, and receipt APIs; and supplier/request/approval/receiving pages. On a fresh temporary MySQL database, migrations applied and an authenticated workflow verified supplier creation, request submission/approval, order creation, partial then final receipt, inventory updates, idempotent retry, and over-receipt rejection. Repeatable automated integration and procurement tenant/campus isolation tests are still absent. Quotations, configurable approval rules, central procurement/allocations, invoice reconciliation, and transfers are absent. |
| 4 — Operational accountability | **NOT IMPLEMENTED** | No production runs, waste records, budgets, cost-per-meal reporting, consolidated dashboards, or report exports exist. |
| 5 — Deployment readiness | **PARTIAL** | `Dockerfile`, `compose.yaml`, Prisma migrations, and liveness/readiness routes provide a deployment baseline. The production Docker image builds, starts, and responds from its liveness route. Compose operation could not be tested because the Compose CLI is unavailable; migration application, backup/restore, rollback, cloud configuration, worker operation, OpenAPI, and load/security/isolation deployment tests remain unverified or absent. |
| 6 — Expansion | **NOT IMPLEMENTED** | Forecasting, supplier comparisons, SSO, accounting/hostel integrations, QR attendance, and offline operation are absent. |

## Implemented and connected paths

- Authentication resolves a hashed opaque session to a user and membership; password changes revoke other sessions. State-changing routes check same-origin requests.
- Membership role and campus scope checks are applied in the inspected APIs. Institution-owned inventory reads and writes include the authenticated institution; composite foreign keys constrain campus/store/ingredient relationships.
- Inventory receipt/issue/waste/adjustment paths connect the UI, API, Prisma schema, transaction, maintained store/ingredient balance, batch quantities, immutable movement records, and audit events. Subtractive movements are allocated FEFO; receipt forms capture optional lot code and expiry date.
- The batch migration retains prior positive aggregate balances as opening batches without a known expiry. Their historical ledger entries remain unallocated because a reliable original lot cannot be inferred.
- Recipe versions and menu plans are tenant-scoped and linked through composite foreign keys. A menu item pins a specific version; requirement calculations aggregate exact milli-units, round fractional demands up, and compare them with non-expired/unknown-expiry batch stock at the menu campus. Managers can publish a draft; publishing does not reserve stock.
- First-run setup connects the UI to a single-use bootstrap endpoint and creates the first institution, campus, administrator, store, session, and audit event transactionally.
- The UI provides setup/sign-in/password-change; a protected role-aware shell; live dashboard; inventory balances; ingredient search/create; stock movement entry/history; store views/create; and administrator campus and team management. Unimplemented modules are explicitly marked as not live and do not have placeholder routes or fake metrics.
- The new procurement UI connects draft requests, submit/approve/reject transitions, purchase orders, and partial/full goods receiving. Server routes scope entities to institution and campus, restrict state transitions by role, and use idempotency keys for receipt retries. The primary admin workflow was exercised against temporary MySQL; all role combinations and cross-tenant/campus edge cases were not.

These are source-level findings, not claims that database-backed user workflows were exercised in this assessment.

## Security, UX, and technical debt

**Tenant isolation:** application queries inspected are scoped by the session's institution, campus restrictions are checked for campus-scoped memberships, and composite foreign keys reinforce tenant integrity. Manual checks across two campuses and two institutions confirmed assigned-campus store scoping and denial/empty results for selected foreign-tenant menu and stock routes. There is still no repeatable database-backed cross-tenant authorization suite or broad coverage of every route, so the acceptance criterion remains only partially verified. Receipt submissions have an idempotency key in the new, unverified procurement path; other critical writes do not have generalized idempotency support.

**Authentication and audit:** passwords use `scrypt`; sessions store SHA-256 token hashes and use `HttpOnly`, `SameSite=Lax` cookies; login attempts are rate-limited through account lockout. Stock changes, recipe/version creation, menu creation/publication, and selected setup/access changes are audited. Email-based invitation/recovery, configurable permissions, and full audit coverage are absent.

**UI/UX:** the authenticated workspace now has consistent responsive navigation, active states, breadcrumbs, institution/campus context, account actions, live low-stock and expiry notifications, page headers, tables, forms, search, campus filters, pagination, status badges, and loading/empty/error/success states. Inventory expiry and recipe/menu/requirements pages were browser-checked; procurement requests and suppliers were also browser-checked at 390px, including mobile navigation, with no horizontal overflow or console errors. Full keyboard/screen-reader review, user profile settings, and production/finance workflows remain outstanding. Bootstrap/login/password-change still use `src/components/operations.tsx`, while workspace pages are separated into page and shared-component files.

**Known defects:** no reproducible application bug was confirmed during this source review. The highest risks are unverified database/runtime behavior, absent integration and authorization coverage, and incomplete product workflows—not verified runtime failures.

## Verification performed

- `npm test` — **PASS**, 10 unit tests.
- `npx prisma format`, `npx prisma validate`, and `npx prisma generate` — **PASS** for the current Prisma schema.
- `npm run typecheck` — **PASS**.
- `npm run build` — **PASS**, including the procurement routes/pages.
- Temporary MySQL: committed migrations applied successfully. Browser-tested bootstrap, ingredient creation, stock receipt, stock issue, campus/store creation, dashboard totals/low-stock alert, temporary-password change, and role-aware navigation. With stores in two campuses, the campus storekeeper saw only the assigned campus store; direct access to the admin team page redirected to the dashboard. These checks used one test institution and do not establish cross-institution isolation.
- Stock batch migration: applied all migrations to a fresh temporary MySQL schema; separately replayed existing migrations, seeded a positive legacy balance, applied the new migration, and verified the amount became an opening batch with no fabricated expiry. Authenticated API verification recorded dated receipts, issued across lots in FEFO order, confirmed the remaining balance and expiry list, and verified an over-issue returned 409 without changing stock.
- Kitchen workflow on temporary MySQL: created recipes and a second immutable version, created a campus lunch plan pinned to the first version, calculated ingredient requirements and a shortage, and confirmed expired stock was excluded from availability. Browser-checked recipe and meal-plan pages at 390px and the requirement detail view; no browser console errors were reported.
- Procurement workflow on a fresh temporary MySQL database: applied all migrations, bootstrapped an institution, created a supplier and request, submitted and approved it, then recorded partial and final receipts. Replayed the first receipt key and confirmed no duplicate inventory; over-receipt was rejected with 409; final order status was received and inventory balance equaled the ordered quantity. Browser-checked request queue and supplier directory at 390px, mobile navigation, and zero console errors. No automated cross-tenant procurement test was performed.
- Authorization/operational checks on temporary MySQL: an institution administrator could not retrieve a foreign-campus menu, foreign menu requirements returned 404, and a stock receipt against another institution's store returned 404. Expired batches could not be issued but could be recorded as waste; a published menu rejected a repeated publish transition. These are manual checks, not a repeatable cross-tenant test suite.
- Responsive browser check at 390px confirmed the mobile navigation opens and can navigate to a workspace page; browser console showed no errors on the tested normal paths after fixing unnecessary API calls during forced-password changes.
- Database-backed cross-tenant testing, an automated end-to-end suite, comprehensive keyboard/screen-reader review, Compose deployment, restore/rollback, and cloud deployment remain **NOT VERIFIED**; Compose CLI is unavailable.

## Priority remaining work

1. Validate and test the procurement migration and supplier → request → approval → partial/final receipt workflow, including idempotent retry, over-receipt rejection, and tenant/campus isolation.
2. Complete Release 1 onboarding/invitation decisions and full institution/campus dashboards.
3. Finish Release 2 production records, stock reservations, and waste workflows; connect meal shortages to purchasing.
4. Complete quotations, central/local purchasing and allocations, transfers, and invoice reconciliation.
5. Add budgets, meal costing, reporting/exports, idempotency for critical operations, and comprehensive audit coverage.
6. Verify cloud/self-hosted deployment, backup/restore and operational procedures; then add integrations and analytics.

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
