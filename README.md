# Hostel Kitchen OS

Hostel Kitchen OS is a multi-tenant kitchen operations application. The current release provides first-institution setup, secure sessions, institution/campus-scoped access, campus and store setup, an ingredient catalog, an auditable stock ledger, and current stock/reorder views.

> **Implementation status:** this is a working foundation, not the completed product described in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). Recipes, menus, procurement, production, finance, user invitation/management, worker jobs, and integrations are not implemented. See the roadmap status annotations for the exact release state.

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
- Passwords use Node.js `scrypt`; sessions use random opaque tokens in `HttpOnly`, `SameSite=Lax` cookies. Only a SHA-256 token hash is stored, and sessions expire after 12 hours.
- Memberships select an institution and role. Campus-scoped memberships are restricted to their assigned campus; institution administrators have institution-wide access.
- Tenant identity is included in inventory queries and composite foreign keys prevent stock records from referencing another tenant's stores or ingredients.
- Stock changes are written to an immutable movement ledger and update a maintained balance in the same database transaction. Issues, waste, and negative adjustments cannot make stock negative. Every stock mutation and initial setup creates an audit event.
- State-changing API calls require same-origin requests. Login failures lock an account for 15 minutes after eight failed attempts.
- The database should be reachable only from the application. Use HTTPS at the reverse proxy and database TLS (`DATABASE_SSL=true`) for remote MySQL servers.

The first-run administrator is currently the only account-creation path. Although the schema defines other membership roles, there is no user invitation or membership administration interface yet. Do not assign operational users by manually editing production database records.

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
- `GET|POST /api/v1/campuses`
- `GET|POST /api/v1/stores`
- `GET|POST /api/v1/ingredients`
- `GET /api/v1/inventory`, `POST /api/v1/inventory/movements`

API pagination is bounded on list endpoints. There is not yet a maintained OpenAPI specification or comprehensive integration/authorization test suite.
