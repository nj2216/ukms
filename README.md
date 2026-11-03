# Hostel Kitchen OS

Hostel Kitchen OS is a multi-tenant kitchen operations application. It provides first-institution setup, secure sessions, campus-scoped inventory, batch expiry tracking, recipe/menu planning, campus purchasing and receiving, production and waste recording, stock transfers, quotations, invoice reconciliation, budgets, reports, and demand/supplier analytics.

> **Implementation status:** this is a working but incomplete product, not the full platform described in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). The latest migration and primary production, procurement, finance, and analytics workflows were manually exercised against temporary MySQL. The application has not been deployed to production; external accounting/hostel connectors are not configured. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for verified scope and remaining work.

## Requirements

- Node.js 22.15 or later for local development.
- Docker Engine with Docker Compose v2 for the included MySQL 8.4 service.
- A MySQL 8.4 database for non-containerized deployments.

## Run locally

1. Install packages and prepare local configuration:

   ```sh
   npm ci
   cp .env.example .env
   ```

2. Generate three independent URL-safe values. Put one in `MYSQL_PASSWORD`, one in `MYSQL_ROOT_PASSWORD`, and one in `BOOTSTRAP_TOKEN` in `.env`:

   ```sh
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   ```

3. Set `DATABASE_URL` in `.env` to the local database connection. For the supplied Compose database, use this format and substitute the value of `MYSQL_PASSWORD`:

   ```text
   mysql://ukms_app:<MYSQL_PASSWORD>@127.0.0.1:3306/ukms
   ```

   The generated passwords are URL-safe. For another MySQL server, use its host, port, database, and a URL-encoded password. Set `DATABASE_SSL=true` when the server requires TLS; certificate verification remains enabled.

4. Start MySQL and apply migrations:

   ```sh
   docker compose up -d db
   npm run db:migrate
   ```

5. Start the development server:

   ```sh
   npm run dev
   ```

   Open `http://localhost:3000`. The first-run form requires the `BOOTSTRAP_TOKEN` from `.env`; it can initialize the first institution only once. The initial administrator's institution slug is generated from the institution name and is used at sign-in.

## Run with Docker Compose

Edit `.env` as described above, but set `DATABASE_URL` to use the Compose service hostname:

```text
mysql://ukms_app:<MYSQL_PASSWORD>@db:3306/ukms
```

Then build, migrate, and start:

```sh
docker compose build
docker compose up -d db
docker compose --profile migration run --rm migrate
docker compose up -d web
```

The web service binds to `127.0.0.1:3000`; put it behind an HTTPS reverse proxy before allowing network access. MySQL is also bound only to loopback. `mysql_data` persists the database across container restarts. Do not remove the volume to troubleshoot a running installation.

## Useful commands

```sh
npm run dev          # local development server
npm run build        # optimized production build
npm start            # serve the production build
npm run typecheck    # TypeScript checks
npm test             # unit tests
npm run db:generate  # regenerate Prisma Client
npm run db:migrate   # apply committed migrations
npm run db:dev       # create/apply a development migration
```

Health endpoints are `/api/health/live` and `/api/health/ready`. Readiness checks database connectivity.

## Current workflows and security boundaries

- The first-run setup creates one institution, its first campus, the institution administrator, and a main store in a transaction. The bootstrap endpoint requires a configured one-time secret of at least 32 characters and is permanently disabled after setup.
- Signed-in users land on a protected workspace with role-aware navigation for overview, kitchen/meal planning, production/waste, inventory/transfers, procurement/quotations, finance/reports, and administration. Institution administrators also have campus, team-access, and audit-log pages. Campus transfers complete atomically; they do not have an in-transit lifecycle.
- Passwords use Node.js `scrypt`; sessions use random opaque tokens in `HttpOnly`, `SameSite=Lax` cookies. Only a SHA-256 token hash is stored, and sessions expire after 12 hours.
- Memberships select an institution and role: institution administrator, campus manager, kitchen staff, storekeeper, procurement officer, finance officer, or auditor. Campus-scoped memberships are restricted to their assigned campus; institution administrators have institution-wide access.
- Tenant identity is included in inventory queries and composite foreign keys prevent stock records from referencing another tenant's stores or ingredients.
- Stock changes are written to an immutable movement ledger and update maintained balance and batch quantities in the same database transaction. Receipts capture optional lot codes and expiry dates; issues consume earliest-expiring, non-expired batches, while waste and negative adjustments can consume expired stock. No movement can make stock negative. Every stock mutation and initial setup creates an audit event. Existing balances are migrated into opening batches without invented expiry dates.
- Recipes use immutable versions with exact base-unit ingredient quantities and serving yields. Campus meal plans pin a recipe version; demand is rounded up to the nearest 0.001 unit and compared with non-expired stock for that campus. Publishing a plan and calculating shortages do not reserve or issue stock.
- Production records issue ingredients transactionally and capture a known cost only when all consumed batch costs are known. Waste distinguishes raw stock from prepared servings and records costs when available. Supplier quotations can be compared and awarded into priced orders. Invoice reconciliation is limited to one invoice per fully received purchase order; budget actuals include reconciled invoices only.
- Reports include production, waste, reconciled spend, inventory valuation, and campus comparisons with CSV export. Demand projections use recent recorded consumption and are intended as transparent planning signals, not an externally validated forecast. Supplier analytics use recorded order and receipt data.
- Integration boundary: the versioned authenticated REST APIs and CSV export can support future integrations, but there is no maintained OpenAPI specification, registered API-client model, webhook delivery, SSO, or live external connector. Provider selection and credentials are required before accounting or hostel adapters can be enabled.
- State-changing API calls require same-origin requests. Login failures lock an account for 15 minutes after eight failed attempts.
- The database should be reachable only from the application. Configure the reverse proxy to preserve the external `Host` and overwrite `X-Forwarded-Proto`; state-changing APIs compare both with the browser `Origin`. Use HTTPS at the reverse proxy and database TLS (`DATABASE_SSL=true`) for remote MySQL servers.

Institution administrators can assign campus roles, edit a teammate's role or campus assignment, and revoke memberships in the team-access panel. Editing one's own membership is not allowed, and the institution must retain at least one administrator. Newly created accounts receive a random temporary password shown once; deliver it to the user through a separate secure channel. Users must change it before accessing institution data. Existing accounts can be assigned a second institution membership without changing their password. Email invitations, password recovery, and self-service institution onboarding are not implemented.

## Backups

The Compose database volume is persistent but is not a backup. Create an off-host backup before upgrades:

```sh
docker compose exec db sh -c 'exec mysqldump --single-transaction -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > ukms.sql
```

Restore into a stopped or isolated installation after taking a separate backup of its current state:

```sh
docker compose exec -T db sh -c 'exec mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < ukms.sql
```

Protect and encrypt backup files according to the institution's data policy. These commands have not been exercised against a production installation; perform and document a restore test before relying on them.

## API surface

The current versioned routes are:

- `POST /api/v1/auth/bootstrap`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/session`, `GET /api/v1/auth/status`
- `POST /api/v1/auth/change-password`
- `GET|POST /api/v1/campuses`
- `GET|POST|PATCH|DELETE /api/v1/memberships` (institution administrators only)
- `GET|POST /api/v1/stores`
- `GET|POST /api/v1/ingredients`
- `GET /api/v1/inventory`, `GET|POST /api/v1/inventory/movements`
- `GET /api/v1/inventory/batches` (scoped expiring/expired batches with a configurable 1–365 day window)
- `GET|POST /api/v1/recipes`, `POST /api/v1/recipes/:id/versions`
- `GET|POST /api/v1/menu-plans`, `PATCH /api/v1/menu-plans/:id` (publish), `GET /api/v1/menu-plans/:id/requirements`
- `GET|POST /api/v1/suppliers`
- `GET|POST|PATCH /api/v1/purchase-requests` (create/list; submit/approve/reject)
- `GET /api/v1/purchase-orders`, `POST /api/v1/purchase-orders/:id/receipts`
- `GET|POST|PATCH /api/v1/supplier-quotes` (record, award, or reject quotations)
- `GET|POST /api/v1/production-runs`, `GET|POST /api/v1/waste`
- `GET|POST /api/v1/stock-transfers` (atomic transfer completion)
- `GET|POST|PATCH /api/v1/supplier-invoices`, `GET|POST /api/v1/budgets`
- `GET /api/v1/reports` (JSON or `?format=csv`), `/api/v1/analytics/forecast`, `/api/v1/analytics/suppliers`
- `GET /api/v1/audit-events` (institution administrators only)
- `GET /api/v1/dashboard` (institution/campus-scoped live counts, reorder alerts, and recent activity)

List endpoints have fixed result limits; ingredients and inventory also support cursor pagination. Automated unit tests exist, but comprehensive repeatable integration and authorization test suites remain outstanding.
