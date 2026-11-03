# Project Status

**Assessed:** 2026-11-03  
**Scope:** Repository source, schema and migrations, documentation, automated checks, temporary MySQL API workflows, and a production build. No production deployment or external integration credentials were available.

**Current implementation update:** Production runs and ingredient issues, raw/prepared-food waste, stock transfers, supplier quotations and award-to-order, invoices, budgets, reports/CSV, demand forecasts, supplier analytics, and an administrator audit log now have database-backed API and workspace pages. The bootstrap/sign-in/forced-password-change page has a responsive branded layout, and [`documentation/WORKFLOWS.md`](documentation/WORKFLOWS.md) documents the application with screenshots of synthetic, database-backed sample workflows. Role-specific navigation and server-side authorization include procurement, finance, and auditor roles. Fresh MySQL migration deployment and primary operational workflows were exercised manually; broad automated authorization/integration coverage and production deployment remain incomplete.

## Architecture and technology

The project is a modular monolith: Next.js App Router pages and Route Handlers, reusable server-side domain/authentication and stock-transaction helpers, Prisma data access, and MySQL. The authenticated UI uses one responsive application shell with role-filtered navigation, breadcrumbs, account and inventory-alert menus, and dedicated inventory, kitchen, production, procurement, finance, reporting, and administration pages. The original root page remains responsible for bootstrap, sign-in, and forced password changes. There is no worker, separate domain package, maintained OpenAPI specification, or live third-party integration adapter.

The locked stack is Next.js 16.4.3, React 19.3.1, TypeScript 7.0.2, Prisma 7.10.1 with the MariaDB/MySQL adapter, and MySQL 8.4 in Compose. Tests use Node's test runner through `tsx`; no UI, integration, or browser-test framework is configured. Styling is custom CSS.

## Release status

| Release | Status | Repository evidence and remaining acceptance work |
|---|---|---|
| 1 — Foundation | **PARTIAL** | First-institution bootstrap, hashed sessions, password changes, membership assignment/edit/revocation, campus records, role checks, audit events, a protected shell, campus/team pages, and a live dashboard exist. System roles now include procurement officer, finance officer, and auditor; the UI and API enforce role and assigned-campus scope. Temporary MySQL verified a storekeeper sees only the assigned campus, cannot record prepared-food waste, and cannot read the administrator audit log. Cross-institution testing, invitations/recovery, configurable permissions, comprehensive automated authorization tests, and full institution/campus dashboards remain incomplete. |
| 2 — Daily operations | **PARTIAL** | Ingredient/store APIs, aggregate balances, stock batches, expiry reporting, recipe versions, campus meal plans, ingredient requirements, production runs, ingredient issues, and waste are connected to pages and APIs. Inventory consumption uses FEFO batches and updates balances, movements, and audit records transactionally. A production workflow was exercised against MySQL, including stock costing and both raw and leftover waste. Reservations, production-to-menu requirement enforcement, meal-service records, and full workflow coverage remain incomplete. |
| 3 — Purchasing | **PARTIAL** | Supplier directory, campus purchase requests, approval, purchase orders, goods receipts, quotations, quote award, campus transfers, invoice reconciliation, and budget actuals are implemented. An authenticated MySQL workflow verified competing quote capture, award to a priced order, receipt, invoice reconciliation, budget spend, and atomic cross-campus transfer. Transfers complete immediately rather than using dispatch/in-transit/receipt states; invoices are limited to one per fully received PO; configurable approval rules, consolidated multi-campus purchase orders, allocation accounting, and repeatable automated authorization tests remain. |
| 4 — Operational accountability | **PARTIAL** | Production output, ingredient issues, raw/prepared waste, cost capture where batch costs are known, budgets, operational/campus reports, inventory valuation, and CSV export are implemented and connected. Cost-per-meal analytics, configurable reporting definitions, printable reports, and broader dashboard comparison remain incomplete. |
| 5 — Deployment readiness | **PARTIAL** | `Dockerfile`, `compose.yaml`, Prisma migrations, and liveness/readiness routes provide a deployment baseline. The production Docker image builds, starts, and responds from its liveness route. Compose operation could not be tested because the Compose CLI is unavailable; migration application, backup/restore, rollback, cloud configuration, worker operation, OpenAPI, and load/security/isolation deployment tests remain unverified or absent. |
| 6 — Expansion | **PARTIAL** | A transparent recent-consumption demand forecast, suggested purchases, and supplier fulfillment/spend comparisons are implemented. No SSO, accounting/hostel connector, QR attendance, offline support, registered API clients, webhook delivery, or institution-specific external adapter is implemented. |

## Implemented and connected paths

- Authentication resolves a hashed opaque session to a user and membership; password changes revoke other sessions. State-changing routes check same-origin requests.
- Membership role and campus scope checks are applied in protected pages and APIs. Institution-owned records are tenant-scoped and composite foreign keys constrain campus/store/ingredient relationships. Roles include procurement officer, finance officer, and auditor in addition to the initial operational roles.
- Inventory receipt/issue/waste/adjustment paths connect the UI, API, Prisma schema, transaction, stock balance, batch quantities, immutable movements, and audit events. Production issues and transfers reuse FEFO stock helpers; transfers preserve cost and expiry in destination batches.
- The batch migration retains prior positive aggregate balances as opening batches without a known expiry. Their historical ledger entries remain unallocated because a reliable original lot cannot be inferred.
- Recipe versions and menu plans are tenant-scoped and linked through composite foreign keys. A menu item pins a specific version; requirement calculations aggregate exact milli-units, round fractional demands up, and compare them with non-expired/unknown-expiry batch stock at the menu campus. Managers can publish a draft; publishing does not reserve stock.
- First-run setup connects the UI to a single-use bootstrap endpoint and creates the first institution, campus, administrator, store, session, and audit event transactionally.
- The authenticated UI connects production records, raw/prepared-food waste, stock transfers, quote comparison and award, goods receiving, invoice reconciliation, budgets, reports/CSV, demand forecasts, supplier comparisons, and an administrator audit log. Data is read from tenant-scoped APIs rather than demo records.
- Invoice entry is limited to fully received purchase orders. Reconciliation checks accepted quantities against agreed order prices; one invoice per PO is enforced to avoid double-counting spend. Budget actuals use reconciled invoices only.
- An authenticated temporary-MySQL API exercise verified quotation capture/award, priced order, receipt, invoice reconciliation, budget totals, production cost and stock issue, raw and leftover waste, atomic campus transfer, operational report/CSV, forecast, supplier analytics, and audit retrieval. This is manual verification, not a committed automated integration suite.

## Security, UX, and technical debt

**Tenant isolation:** institution-scoped queries and composite foreign keys constrain the new workflows; campus-scoped roles are restricted through `scopedCampusId`. Manual tests confirmed assigned-campus store visibility and cross-campus denial for a storekeeper. There is no repeatable database-backed cross-tenant suite or broad route coverage, so isolation remains only partially verified. Receipt submissions use idempotency keys; other critical writes do not have generalized idempotency support.

**Authentication and audit:** passwords use `scrypt`; sessions store SHA-256 token hashes and use `HttpOnly`, `SameSite=Lax` cookies; login attempts are rate-limited through account lockout. Stock, production, waste, transfer, quotation, invoice, budget, setup, and selected access changes are audited. The administrator audit page displays the latest 200 events. Email-based invitation/recovery, configurable permissions, and universal audit coverage are absent.

**UI/UX:** one responsive shell groups dashboard, kitchen, production, inventory, procurement, finance/reporting, and administration. Role-filtered links, active states, breadcrumbs, campus context, account actions, inventory alerts, shared page headers, tables, forms, filters, status badges, and loading/empty/error/success states are present. The bootstrap/sign-in/forced-password-change screens use a branded responsive layout with password-manager autocomplete. Production-build browser checks captured the sign-in and authenticated dashboard, inventory, meal-planning, procurement, quotations, production, waste, transfer, finance, reporting, and audit pages at a 1440px viewport; the sign-in layout was also checked at 390px with no horizontal overflow. The tested normal routes reported no browser console errors. These are visual smoke checks, not a full keyboard/screen-reader or all-role review. User profile settings and accessibility review remain outstanding. Authentication UI remains in `src/components/operations.tsx`; workspace modules use shared page/components.

**Known limitations:** transfers complete immediately rather than moving through dispatch/in-transit/receipt states. Purchase orders remain campus-scoped instead of consolidated multi-campus orders. Only one invoice per fully received PO is supported; taxes, payments, partial invoice allocations, and line-level reconciliation are not modeled. Demand forecasting is a transparent linear projection, not a validated forecasting model. No live third-party integrations or production deployment were configured.

## Verification performed

- `npm test` — **PASS**, 10 unit tests.
- `npx prisma format`, `npx prisma validate`, `npx prisma generate`, and `npm run typecheck` — **PASS**.
- Fresh temporary MySQL — **PASS**; all 6 migrations applied with `prisma migrate deploy`, including the consolidated operations/finance/analytics migration.
- Authenticated API workflow — **PASS** for quotation award, priced order, receipt, invoice reconciliation, budget actuals, production issue/cost, raw and leftover waste, atomic transfer, reports/CSV, forecast, supplier analytics, and audit events.
- Failure-path checks — **PASS**; insufficient transfers returned 409 without changing stock/history, and invoice entry rejected a partially received order.
- Authorization checks on temporary MySQL — **PASS** for assigned-campus store visibility, cross-campus denial, storekeeper restriction to raw waste, and administrator-only audit access. This did not test cross-institution access across all new routes.
- `npm run build` — **PASS**, including all new workspace and API routes. The rebuilt production server returned a successful liveness response.
- Production-build workflow walkthrough — **PASS**; 12 desktop page captures and one mobile sign-in capture are embedded in `documentation/WORKFLOWS.md`. Captures used an isolated temporary MySQL database with synthetic records; tested routes had no browser console errors, and the 390px sign-in layout had no horizontal overflow.
- Production and waste browser smoke test — **PASS** for navigation to the Production Records and Leftovers & waste pages, mobile navigation, no horizontal overflow at 390px, and zero console errors. Broader desktop/mobile interaction testing and full browser QA remain incomplete.
- Temporary MySQL: committed migrations applied successfully. Browser-tested bootstrap, ingredient creation, stock receipt, stock issue, campus/store creation, dashboard totals/low-stock alert, temporary-password change, and role-aware navigation. With stores in two campuses, the campus storekeeper saw only the assigned campus store; direct access to the admin team page redirected to the dashboard. These checks used one test institution and do not establish cross-institution isolation.
- Stock batch migration: applied all migrations to a fresh temporary MySQL schema; separately replayed existing migrations, seeded a positive legacy balance, applied the new migration, and verified the amount became an opening batch with no fabricated expiry. Authenticated API verification recorded dated receipts, issued across lots in FEFO order, confirmed the remaining balance and expiry list, and verified an over-issue returned 409 without changing stock.
- Kitchen workflow on temporary MySQL: created recipes and a second immutable version, created a campus lunch plan pinned to the first version, calculated ingredient requirements and a shortage, and confirmed expired stock was excluded from availability. Browser-checked recipe and meal-plan pages at 390px and the requirement detail view; no browser console errors were reported.
- Procurement workflow on a fresh temporary MySQL database: applied all migrations, bootstrapped an institution, created a supplier and request, submitted and approved it, then recorded partial and final receipts. Replayed the first receipt key and confirmed no duplicate inventory; over-receipt was rejected with 409; final order status was received and inventory balance equaled the ordered quantity. Browser-checked request queue and supplier directory at 390px, mobile navigation, and zero console errors. No automated cross-tenant procurement test was performed.
- Authorization/operational checks on temporary MySQL: an institution administrator could not retrieve a foreign-campus menu, foreign menu requirements returned 404, and a stock receipt against another institution's store returned 404. Expired batches could not be issued but could be recorded as waste; a published menu rejected a repeated publish transition. These are manual checks, not a repeatable cross-tenant test suite.
- Responsive browser check at 390px confirmed the mobile navigation opens and can navigate to a workspace page; browser console showed no errors on the tested normal paths after fixing unnecessary API calls during forced-password changes.
- Database-backed cross-tenant testing, an automated end-to-end suite, comprehensive keyboard/screen-reader review, Compose deployment, restore/rollback, and cloud deployment remain **NOT VERIFIED**; Compose CLI is unavailable.

## Priority remaining work

1. Add repeatable automated MySQL integration, cross-tenant authorization, role permission, and idempotency tests.
2. Connect menu shortage calculations to reservations, purchasing, production, and service reconciliation; add stock counts and adjustment workflow.
3. Implement consolidated multi-campus procurement/allocation accounting and dispatch/in-transit/receipt transfer lifecycle.
4. Add invoice line allocations/partial invoices, payment/tax handling, cost-per-meal summaries, printable reports, and validated analytics.
5. Add OpenAPI documentation and institution-specific accounting/hostel integration adapters after provider and credential requirements are defined.
6. Complete invitation/recovery, configurable approval policies, cloud/self-hosted deployment, monitoring, restore/rollback, and accessibility verification.

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
