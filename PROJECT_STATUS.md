# Project Status

**Assessed:** 2026-11-03  
**Scope:** Repository source, schema and committed migrations, documentation, unit tests, local builds, and temporary MySQL/browser verification. Docker Compose deployment was not tested because the Compose CLI is missing.

**Current implementation update:** in addition to the membership-edit workflow documented below, the application now has a role-aware authenticated workspace, actual pages for implemented inventory and administration capabilities, and a scoped dashboard API. Database/browser checks below exercise the supported stock and access workflows. Unimplemented product areas are intentionally not represented as working pages.

## Architecture and technology

The project is a modular monolith: Next.js App Router pages and Route Handlers, reusable server-side domain/authentication helpers, Prisma data access, and MySQL. The authenticated UI uses an application shell with responsive sidebar, breadcrumbs, account and alert menus, plus dedicated overview, inventory, ingredient, movement, store, campus, and team-access pages. The original root page remains responsible for bootstrap, sign-in, and forced password changes. There is no worker, separate domain package, API specification, or integration adapter.

The locked stack is Next.js 16.4.3, React 19.3.1, TypeScript 7.0.2, Prisma 7.10.1 with the MariaDB/MySQL adapter, and MySQL 8.4 in Compose. Tests use Node's test runner through `tsx`; no UI, integration, or browser-test framework is configured. Styling is custom CSS.

## Release status

| Release | Status | Repository evidence and remaining acceptance work |
|---|---|---|
| 1 — Foundation | **PARTIAL** | `src/app/api/v1/auth/*`, `memberships`, and `campuses` implement one-time first-institution bootstrap, hashed sessions, password changes, membership assignment/edit/revocation, campus records, and role checks. Membership edits prevent self-lockout and removal of the final administrator and write an audit event. The protected application shell and role-aware administration pages exist. A temporary-MySQL/browser check confirmed a campus storekeeper sees only the assigned campus's store across two campuses. Additional institution onboarding, invitations/recovery, and automated cross-tenant authorization tests are absent. The two-institution acceptance criterion is **UNVERIFIED**. |
| 2 — Daily operations | **PARTIAL** | Ingredient/store APIs and inventory movement/balance paths connect to dedicated pages. Movements transactionally update balances, append ledger rows, and add audit events; live dashboard counts, recent activity, reorder alerts, ingredient search, and paginated movement history are implemented. Temporary-MySQL/browser testing exercised ingredient creation, receipt, issue, and the resulting low-stock alert. Stock batches/expiry, recipe versions, menus, demand calculations, and complete kitchen workflows are absent. |
| 3 — Purchasing | **NOT IMPLEMENTED** | No supplier, quotation, request/order, approval, goods-receipt, invoice, allocation, or transfer modules exist. |
| 4 — Operational accountability | **NOT IMPLEMENTED** | No production runs, waste records, budgets, cost-per-meal reporting, consolidated dashboards, or report exports exist. |
| 5 — Deployment readiness | **PARTIAL** | `Dockerfile`, `compose.yaml`, Prisma migrations, and liveness/readiness routes provide a deployment baseline. The production Docker image builds, starts, and responds from its liveness route. Compose operation could not be tested because the Compose CLI is unavailable; migration application, backup/restore, rollback, cloud configuration, worker operation, OpenAPI, and load/security/isolation deployment tests remain unverified or absent. |
| 6 — Expansion | **NOT IMPLEMENTED** | Forecasting, supplier comparisons, SSO, accounting/hostel integrations, QR attendance, and offline operation are absent. |

## Implemented and connected paths

- Authentication resolves a hashed opaque session to a user and membership; password changes revoke other sessions. State-changing routes check same-origin requests.
- Membership role and campus scope checks are applied in the inspected APIs. Institution-owned inventory reads and writes include the authenticated institution; composite foreign keys constrain campus/store/ingredient relationships.
- Inventory receipt/issue/waste/adjustment paths connect the UI, API, Prisma schema, transaction, maintained balance, immutable movement record, and audit event.
- First-run setup connects the UI to a single-use bootstrap endpoint and creates the first institution, campus, administrator, store, session, and audit event transactionally.
- The UI provides setup/sign-in/password-change; a protected role-aware shell; live dashboard; inventory balances; ingredient search/create; stock movement entry/history; store views/create; and administrator campus and team management. Unimplemented modules are explicitly marked as not live and do not have placeholder routes or fake metrics.

These are source-level findings, not claims that database-backed user workflows were exercised in this assessment.

## Security, UX, and technical debt

**Tenant isolation:** application queries inspected are scoped by the session's institution, campus restrictions are checked for campus-scoped memberships, and composite foreign keys reinforce tenant integrity. A manual two-campus database/browser check confirmed store scoping for a campus storekeeper; there is still no repeatable database-backed cross-tenant authorization suite, so institution isolation remains unverified. There is no idempotency support for critical writes.

**Authentication and audit:** passwords use `scrypt`; sessions store SHA-256 token hashes and use `HttpOnly`, `SameSite=Lax` cookies; login attempts are rate-limited through account lockout. Stock and selected setup/access changes are audited. Email-based invitation/recovery, configurable permissions, and full audit coverage are absent.

**UI/UX:** the authenticated workspace now has consistent responsive navigation, active states, breadcrumbs, institution/campus context, account actions, live low-stock notification counts, page headers, tables, forms, search, campus filters, pagination, status badges, and loading/empty/error/success states. The 390px mobile navigation and a direct non-admin attempt to access Team Access were browser-checked. Full keyboard/screen-reader review, user profile settings, and the unavailable kitchen/procurement/finance workflows remain outstanding. Bootstrap/login/password-change still use `src/components/operations.tsx`, while workspace pages are separated into page and shared-component files.

**Known defects:** no reproducible application bug was confirmed during this source review. The highest risks are unverified database/runtime behavior, absent integration and authorization coverage, and incomplete product workflows—not verified runtime failures.

## Verification performed

- `npm test` — **PASS**, 8 unit tests.
- `npm run typecheck` — **PASS**.
- `npx prisma validate` — **PASS**.
- `npm run build` — **PASS**, optimized Next.js production build.
- Temporary MySQL: committed migrations applied successfully. Browser-tested bootstrap, ingredient creation, stock receipt, stock issue, campus/store creation, dashboard totals/low-stock alert, temporary-password change, and role-aware navigation. With stores in two campuses, the campus storekeeper saw only the assigned campus store; direct access to the admin team page redirected to the dashboard. These checks used one test institution and do not establish cross-institution isolation.
- Responsive browser check at 390px confirmed the mobile navigation opens and can navigate to a workspace page; browser console showed no errors on the tested normal paths after fixing unnecessary API calls during forced-password changes.
- Database-backed cross-tenant testing, an automated end-to-end suite, comprehensive keyboard/screen-reader review, Compose deployment, restore/rollback, and cloud deployment remain **NOT VERIFIED**; Compose CLI is unavailable.

## Priority remaining work

1. Add repeatable database-backed tenant/campus authorization tests across two institutions and automate the browser-tested workflows.
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
