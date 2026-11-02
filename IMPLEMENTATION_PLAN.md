# Hostel Kitchen OS — Refined Architecture & Implementation Blueprint

I’d design Hostel Kitchen OS as a multi-tenant, multi-campus kitchen operations platform that can be deployed both as a cloud service and on a university’s own servers.

Your proposed stack is a good fit, with one important clarification: Next.js can provide the web interface and backend-for-frontend/API routes, but it should not be treated as the database or the entire business architecture by default. For the first version, you can keep the system as a modular Next.js application backed by MySQL, with clearly separated business modules and authorization boundaries.

The platform should support three things from day one:

- Multiple universities using the same cloud service, with strict institution-level isolation.
    
- Universities running their own self-hosted installation.
    
- Multiple campuses within each university, with local operational control and central administrative oversight.
    

Central and local procurement should both work. A university can purchase selected ingredients in bulk and allocate them across campuses, while each campus independently purchases its remaining requirements.

## 1. Recommended technology stack

![Making a custom 404 page in Next.js - DEV Community](https://images.openai.com/static-rsc-4/bLlalbNp6jrlR_MDbXrZboKQVewUYbl540tPaxrKHfeYhkUuIbcY24EuZwqdvoz2T6syE51AVhW2nzEAnbXMhFU1S9FS9hfRUHcmE0rqe4-MftFGYbc3hxELPbunRQ4RO1h7brQUYFBkCbuY4CGkHzzUDPnQR728ILI1Y17qp2M?purpose=inline)

Frontend and web application — Next.js + React + TypeScript

App Router, responsive dashboards, forms, server-rendered pages and role-aware navigation.

![Kanbel Technologies](https://images.openai.com/static-rsc-4/lIUH81tejlkswCXyNrWuAAxHsjybAQlaIuDKv-Z_XUmCzHcKcT0u90kraHfiEhBc5_c_lgT8bKGRksbnHzwIig_sBovMW8wilv9VZzv32K_9sTK0jrXJGhpYyCvO-HD-GtYa78cFp6aregV3pNY-Eylq1Zne85ayQKZjtQ3hhl4?purpose=inline)

Database — MySQL 8.4 LTS

Transactional storage, foreign keys, indexes, constraints, reporting queries and institution-scoped records.

![Prisma.io Logo PNG,  Vector (AI, EPS, CDR, PDF, SVG) - iconLogoVector](https://images.openai.com/static-rsc-4/36vnwtcqs7qeTUpQ0yVprgo1K3SqbUglS8AjBYpTqKy_1v-yS8EX4yHyca7LNkUDZBaeE7PpCNY1ItHwix4bkkv4gBq95v2Dw0Zsgm7Dg9zhMgSQ_sSJ3YD39SAZCCuTcHIR7qdMKvWxYzP9RfN4aa-Kf-1pG6pxd_2yTH3AhOk?purpose=inline)

Database access — Prisma ORM

Typed queries, schema management and migrations. Use explicit transactions for stock and procurement workflows.

![TypeScript Logo Icons for Web and App Development](https://images.openai.com/static-rsc-4/Pbx8y0BkFx2FGL0rrQv12qhf7VCxQjJIxX5qzDbXfFc_2r0281FTrrhYxXs3oeHVXGVOioNH7bLrVixEVSASmJ_wcEhF77ZXSHxlzycjvcxjtXJBHHMnjUNYoQ5lFVUZW7gTZd7KpLmODFhOjJ9wCXSRFqfHbE7Oj1PItTwTFWk?purpose=inline)

Business logic and API — TypeScript

Domain modules, validation, permission checks, versioned REST endpoints and integration adapters.

![Astracode](https://images.openai.com/static-rsc-4/Wwts0P9HyFAO3LVBEVuN-173hnaFbpQgPR-irT8pKvJThZeUKq94s66BjM2I9s3mojvC5pPpSnyLqKhKJNO2GhsmGLuKS1zOkgMOK_sOvFsZwXjM47WN44UpEIuWu5F7brueE6QrWmUJwpxteLeFNa2_SvJus7Y7aFhQ2bf13mY?purpose=inline)

Deployment — Docker

Consistent cloud and self-hosted deployments, with configuration supplied through environment variables and deployment secrets.

### Supporting choices

|Concern|Recommendation|
|---|---|
|UI|Tailwind CSS and a consistent component system|
|Forms|React Hook Form with Zod validation|
|Authentication|Secure session-based authentication, with optional OIDC/SSO later|
|Background jobs|A separately runnable worker for notifications, scheduled reports and expiry alerts|
|File storage|S3-compatible object storage; local storage adapter for self-hosted installs|
|Testing|Vitest, React Testing Library and Playwright|
|API documentation|OpenAPI|
|Observability|Structured logs, health checks, metrics and error reporting|
|CI/CD|Automated tests, migration checks and reproducible Docker builds|

Why MySQL? It is a perfectly reasonable choice for this product. Use InnoDB, foreign keys, explicit transactions and appropriate indexes. Keep tenant isolation enforced in application services and database constraints; MySQL does not provide PostgreSQL-style row-level security, so access control must not depend on a database feature it doesn't have.

One deployment rule: cloud and self-hosted versions should use the same application code and migration history. Avoid separate codebases for the two deployment models.

ORM version note: pin a MySQL-compatible release of Prisma ORM 7 for the initial implementation. The current Prisma 8 documentation lists MySQL support as forthcoming, so don't upgrade blindly to Prisma 8 while MySQL is a requirement.

![](https://www.google.com/s2/favicons?domain=https://docs.prisma.io&sz=32)

Prisma Documentation

+1

## 2. High-level system architecture

Use a modular monolith with a separate background worker. The API and worker share domain services and database access code; they do not implement separate versions of the business rules.

React / Next.js application

Institution console · Campus console · Kitchen operations · Store · Finance

API and application services

Session authentication · Authorization · Tenant context · Validation · Domain workflows

Core modules

Campuses, menus, inventory, purchasing, production

Shared services

Audit, notifications, reports, integrations

MySQL

Tenant-aware records · Transactions · Constraints · Operational history

Background worker

Alerts, scheduled jobs and retries

External adapters

Optional future integrations

Next.js supports both Node.js server and Docker deployments with full feature support, making it suitable for cloud and self-hosted installations.

![](https://www.google.com/s2/favicons?domain=https://nextjs.org&sz=32)

Next.js

+1

### Keep the boundaries clean

- UI layer: displays information and collects user input.
    
- API layer: authenticates requests, validates payloads, and enforces permissions.
    
- Domain layer: implements inventory, procurement, recipe, and production rules.
    
- Data layer: performs scoped database queries and transactions.
    
- Worker layer: runs scheduled tasks without relying on a browser session.
    
- Integration layer: translates external systems into internal domain operations.
    

Next.js Route Handlers can expose the REST API. Keep business rules in reusable server-side services rather than putting them directly in page components or route handlers.

For the initial product, avoid a second backend framework unless a specific requirement justifies it. A separate service can be introduced later if the system needs independently scaled APIs or integrations.

## 3. Multi-tenancy and institution isolation

Treat an institution as the primary customer and security boundary.

Shared SaaS deployment

One application version · Tenant-scoped requests

Institution A

Campuses A1, A2, A3

Own users, data, policies and reports

Institution B

Campuses B1, B2

Separate users, data, policies and reports

Institution A's administrators must never be able to access Institution B's records.

### Recommended tenancy strategy

Start with a shared application and shared MySQL database using logical tenant isolation for the SaaS version. Give every institution-owned record a tenant identity, enforce scope in every data-access path, and use composite foreign keys or equivalent integrity constraints to prevent records from referencing another institution's resources.

For self-hosted customers, use the same codebase and support either:

- A dedicated database for the institution, which is the simpler default for independent installations.
    
- A shared database deployment where the customer explicitly wants multiple institutions in one installation.
    

The application should support both deployment modes without hard-coded assumptions about a single institution.

### A tenant-aware request flow

Every authenticated request should follow this sequence:

1. Authenticate the user.
    
2. Resolve the active institution from trusted server-side session state and validated membership.
    
3. Load the user's authorized campus and resource assignments.
    
4. Validate the requested action against both role permissions and resource scope.
    
5. Run a tenant-scoped service operation.
    
6. Write audit information for sensitive actions.
    
7. Return only authorized fields and records.
    

A user switching between institutions or campuses must not gain access merely by changing a URL, request body, or query parameter. Institution-wide permissions and cross-campus assignments should be explicit grants.

## 4. Database design

The schema needs to support three kinds of ownership:

1. Institution-owned: shared ingredient catalog, institution-wide policies, recipe templates, approval rules.
    
2. Campus-owned: local menus, budgets, kitchens, stores, staff assignments and operational reports.
    
3. Transaction-owned: purchase requests, goods receipts, stock movements, production runs and approvals.
    

Do not put a `campus_id` on every record indiscriminately. A central purchase order may serve several campuses, while each receipt and stock movement belongs to a particular physical location. Model the actual ownership and relationships.

### A. Organizational foundation

|Table|Key fields|
|---|---|
|`institutions`|`id`, `name`, `slug`, `status`, `timezone`, `currency`, `settings`|
|`campuses`|`id`, `institution_id`, `name`, `code`, `status`, `timezone`|
|`hostels`|`id`, `institution_id`, `campus_id`, `name`, `capacity`, `status`|
|`kitchens`|`id`, `institution_id`, `campus_id`, `name`, `status`|
|`stores`|`id`, `institution_id`, `campus_id`, `name`, `store_type`|
|`dining_halls`|`id`, `institution_id`, `campus_id`, `name`, `capacity`|
|`kitchen_service_areas`|`kitchen_id`, `dining_hall_id`, service relationship and validity dates|

The last table allows one kitchen to serve multiple dining halls, and multiple kitchens to serve the same dining hall when needed.

### B. Users and permissions

|Table|Purpose|
|---|---|
|`users`|Login identity and account status|
|`roles`|Institution-configurable or system-defined roles|
|`permissions`|Named actions, such as `inventory.receive`|
|`role_permissions`|Actions granted to each role|
|`user_memberships`|Institutions a user can access|
|`user_scope_assignments`|Campus, kitchen, store, or resource assignments|
|`user_role_assignments`|Role assignments at the appropriate scope|
|`sessions`|Revocable server-side sessions, if using database-backed sessions|
|`audit_events`|Security and operational audit trail|

Keep global platform operators separate from institution administrators. A platform operator who maintains the software should not automatically be able to browse customer food, financial, or staffing records.

### C. Inventory and catalog

|Table|Purpose|
|---|---|
|`ingredients`|Ingredient identity, category, base unit and status|
|`ingredient_units`|Allowed units and conversions|
|`ingredient_scope_settings`|Institution-specific or campus-specific thresholds and rules|
|`stock_batches`|Received batch, quantity, cost, expiry and status|
|`stock_balances`|Current quantity by store and batch, if using a maintained balance projection|
|`stock_movements`|Immutable receipts, issues, transfers, waste and adjustments|
|`stock_reservations`|Quantities reserved for production or other authorized purposes|
|`stock_transfers`|Transfer header, origin, destination, status and dispatch/receipt details|
|`stock_counts`|Physical stock counts and reconciliation records|

Use `stock_movements` as the authoritative transaction history. If `stock_balances` is maintained for performance, update it atomically with each movement and provide reconciliation checks. Do not let users edit a balance directly without recording a corresponding transaction.

### D. Recipes and meal operations

|Table|Purpose|
|---|---|
|`recipes`|Recipe identity and ownership|
|`recipe_versions`|Ingredient quantities, serving yield and effective dates|
|`recipe_ingredients`|Ingredient and quantity per recipe version|
|`menu_plans`|Planned meal and service date|
|`menu_plan_items`|Dishes, recipes, quantities and service locations|
|`demand_forecasts`|Expected servings, source, calculation and confidence metadata|
|`production_runs`|Actual preparation and output|
|`production_ingredient_issues`|Ingredients issued to a production run|
|`meal_service_records`|Prepared, served, and leftover quantities|
|`waste_records`|Waste quantity, category, reason and cost|

A published menu should reference a specific recipe version. If a recipe changes later, historical production costs must still be reproducible using the version that was actually used.

### E. Procurement and finance

|Table|Purpose|
|---|---|
|`suppliers`|Supplier identity and institution-level relationship|
|`supplier_items`|Supplier-specific product, pack size and price history|
|`purchase_requests`|Requests from kitchens or campuses|
|`purchase_request_items`|Ingredient, quantity, unit and estimated price|
|`purchase_orders`|Approved order, buyer, supplier and funding scope|
|`purchase_order_items`|Ordered quantities, prices, taxes and units|
|`goods_receipts`|Delivery header and receiving location|
|`goods_receipt_items`|Accepted, rejected, damaged and short-delivered quantities|
|`supplier_invoices`|Invoice details and reconciliation status|
|`budgets`|Institution or campus budget allocations|
|`budget_allocations`|Distribution of centrally managed budgets|
|`expenses`|Approved or recorded expenditure|
|`approval_records`|Approval decisions, actors and timestamps|

An invoice, purchase order, and goods receipt represent different events. They should be linked but never treated as interchangeable.

### F. Integration and reliability

|Table|Purpose|
|---|---|
|`external_id_mappings`|External system, entity type, external ID and internal ID|
|`api_clients`|Registered API clients and access scopes|
|`webhook_subscriptions`|Configured outbound event destinations|
|`outbox_events`|Events awaiting reliable delivery|
|`idempotency_records`|Deduplication for critical retried requests|
|`notification_jobs`|Scheduled or pending notifications|
|`migration_metadata`|Application/deployment migration tracking, where needed|

This structure is a starting design, not a requirement to create every table before development. Build and migrate the schema incrementally alongside each working feature.

### Database integrity rules

- Use InnoDB and foreign keys.
    
- Add indexes for common queries, particularly tenant, campus, store, date, and status combinations.
    
- Use decimal types for monetary amounts and appropriate decimal precision for ingredient quantities.
    
- Store timestamps consistently, with a defined timezone policy.
    
- Use composite constraints to prevent cross-institution references.
    
- Keep critical operations transactional.
    
- Use migrations to evolve production schemas; never depend on automatic schema synchronization in production.
    

For stock receipt, for example, the receipt record, batch creation, stock movement, balance update, and relevant audit event should either commit together or roll back together. MySQL's foreign-key and transaction capabilities support these integrity requirements.

![](https://www.google.com/s2/favicons?domain=https://dev.mysql.com&sz=32)

dev.mysql.com

+1

## 5. Hybrid procurement architecture

The university should be able to buy centrally, locally, or through a combination of both.

Campus demand planning

Each campus calculates shortages from its own forecast and stock.

Central purchasing

Bulk orders, shared contracts, negotiated pricing

Allocate deliveries to campuses or a central store.

Local purchasing

Campus suppliers, emergency purchases, local produce

Receive goods directly into the authorized campus store.

Consolidated reporting

Track commitments, receipts, allocations, actual stock and costs without double-counting.

### Central purchasing workflow

1. Each campus submits demand for a planning period.
    
2. The institution groups eligible requirements for selected ingredients.
    
3. Procurement reviews suppliers, quotations, pack sizes, delivery schedules and total costs.
    
4. Authorized personnel approve the consolidated purchase.
    
5. The purchase order records which campuses or stores are intended to receive the goods.
    
6. Deliveries are received at the designated central or campus locations.
    
7. Accepted quantities become stock at the actual receiving location.
    
8. Transfers and allocations are tracked as separate stock movements.
    
9. Central finance and campus administrators review actual expenditure and allocation costs.
    

### Local purchasing workflow

1. A kitchen identifies a shortage.
    
2. It creates a purchase request for its campus.
    
3. The campus approval rules determine who must authorize it.
    
4. The authorized buyer creates an order with a local supplier.
    
5. The storekeeper records the actual delivery and any discrepancies.
    
6. The system updates the campus stock and records the actual cost.
    
7. The campus dashboard and consolidated institutional report update.
    

### Avoid double-counting costs

A centrally purchased ingredient may pass through a central store before reaching a campus. The institution should distinguish:

- The original supplier purchase and its committed/actual cost.
    
- The physical movement of the ingredient.
    
- The quantity received by the campus.
    
- The cost allocation used in campus performance reports.
    

Moving 100 kg of rice from a central store to Campus A is not a second supplier purchase. Internal transfers must not inflate consolidated institutional expenditure.

Support different accounting policies for cost allocation without duplicating the original expense. If the institution later needs full accounting integration, map these events to its accounting system through an adapter.

## 6. API design and future integration

Use a versioned REST API from the beginning, even if the first user interface calls it through internal Next.js services.

Suggested route structure:

```
/api/v1/auth/*
/api/v1/institutions/*
/api/v1/campuses/*
/api/v1/hostels/*
/api/v1/kitchens/*
/api/v1/stores/*
/api/v1/ingredients/*
/api/v1/recipes/*
/api/v1/menus/*
/api/v1/inventory/*
/api/v1/stock-transfers/*
/api/v1/purchase-requests/*
/api/v1/purchase-orders/*
/api/v1/goods-receipts/*
/api/v1/production-runs/*
/api/v1/reports/*
/api/v1/integrations/*
```

The API should support filtering, pagination, validation errors, consistent response formats, and explicit authorization failures. Use stable identifiers rather than exposing database implementation details as public contracts.

### Integration rules

- Maintain an OpenAPI specification and version the API.
    
- Use explicit external-ID mapping instead of making another system's IDs your primary keys.
    
- Support idempotency for operations that may be retried.
    
- Publish reliable integration events for significant changes.
    
- Keep webhook delivery separate from the transaction that creates the event.
    
- Provide API-client scopes, revocation, rotation, and audit logging.
    
- Never expose raw database credentials or let integrations connect directly to the database.
    

For example, a future hostel information system could provide resident counts, while an accounting system receives approved expenses. Hostel Kitchen OS remains fully operational without either connection. H2 can be supported in the future using exactly the same integration principles, but it is not a dependency.

## 7. Repository and module structure

I would organize the code around business domains, not one enormous `app` folder and not separate applications for every role.

```
hostel-kitchen-os/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/
│   │       │   ├── (institution-admin)/
│   │       │   ├── (campus)/
│   │       │   ├── (kitchen)/
│   │       │   ├── (stores)/
│   │       │   └── api/v1/
│   │       ├── components/
│   │       ├── features/
│   │       └── lib/
│   └── worker/
│       └── src/
│
├── packages/
│   ├── db/
│   │   ├── prisma/
│   │   ├── migrations/
│   │   └── src/
│   ├── domain/
│   │   └── src/
│   │       ├── institutions/
│   │       ├── campuses/
│   │       ├── access-control/
│   │       ├── inventory/
│   │       ├── recipes/
│   │       ├── menus/
│   │       ├── procurement/
│   │       ├── production/
│   │       ├── finance/
│   │       ├── reporting/
│   │       └── integrations/
│   ├── validation/
│   └── shared/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── authorization/
│   └── e2e/
│
├── deploy/
│   ├── docker/
│   ├── compose/
│   ├── nginx/
│   └── scripts/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── deployment/
│   └── operations/
│
├── Dockerfile
├── compose.yaml
├── package.json
└── README.md
```

This is a suggested monorepo layout. You can simplify it initially if the repository becomes unnecessarily complicated, but keep domain logic reusable and independent of the UI.

The `domain` package should not import React components. The worker should call the same application services as the web application. The database package should not decide whether a user is allowed to perform a business action; authorization belongs in the application/domain boundary and must be enforced before data is exposed or changed.

## 8. Cloud and self-hosted deployment

Both deployment modes should use the same container images, schema migrations, and application configuration conventions.

Cloud deployment

Hosted and operated by you

- Managed or administered MySQL
    
- HTTPS and managed secrets
    
- Automated backups
    
- Monitoring and alerting
    
- Tenant onboarding
    
- Controlled rolling releases
    

Self-hosted deployment

Operated by the institution

- Docker-compatible installation
    
- Customer-managed MySQL
    
- Local or institution-managed storage
    
- Customer-controlled backups
    
- Upgrade and migration tooling
    
- Health checks and diagnostics
    

### Suggested production container layout

```
Reverse proxy (HTTPS)
        |
        v
Next.js web/API container
        |
        +------ MySQL
        |
        +------ Object storage
        |
        +------ Background worker
                    |
                    +--- Email / notifications
```

For self-hosting, package the web application, worker, and database configuration in a documented Compose deployment. The database can run in the Compose stack for smaller installations or on an institution-managed database server. Persist database and file data outside disposable containers.

### Deployment requirements

- Supply a `.env.example`, not real credentials.
    
- Generate strong per-installation secrets.
    
- Expose only necessary ports; MySQL should not be publicly accessible.
    
- Put the application behind a reverse proxy and use HTTPS where network access requires it.
    
- Provide `/health/live` and `/health/ready` checks.
    
- Run migrations as a controlled deployment step, not automatically on every application startup.
    
- Back up databases and uploaded files, and document a tested restore process.
    
- Define support policy for application versions and security updates.
    
- Avoid automatic outbound telemetry in self-hosted deployments without explicit configuration and disclosure.
    
- Make export and backup formats documented, so institutions can retain control over their data.
    

Next.js's official self-hosting guidance recommends a reverse proxy in front of the application server.

![](https://www.google.com/s2/favicons?domain=https://nextjs.org&sz=32)

Next.js

+1

## 9. Implementation roadmap

I would build this as a sequence of working releases. Each release should leave the application usable rather than postponing everything until all modules are finished.

Release 1

Foundation

Institutions, campuses and access control

- Next.js application, MySQL, ORM and migration setup.
    
- Institution onboarding and campus management.
    
- User authentication, roles, memberships and scope assignments.
    
- Tenant isolation and audit logging.
    
- Institution and campus dashboard shells.
    
- Automated authorization tests.
    

Done when: two institutions can share a test deployment, with multiple campuses each, without cross-tenant data access.

Release 2

Daily operations

Ingredients, stores, recipes and menus

- Ingredient catalog and units.
    
- Batch stock, expiry tracking and stock movements.
    
- Recipes with version history.
    
- Meal schedules and service locations.
    
- Manual demand planning and ingredient calculations.
    
- Shortage and expiry alerts.
    

Done when: a kitchen can plan tomorrow's menu, calculate requirements and identify shortages using real stock.

Release 3

Purchasing

Central and local procurement

- Suppliers, quotations and purchase requests.
    
- Configurable approval rules.
    
- Central purchase orders and campus allocation plans.
    
- Local purchase orders.
    
- Goods receipt, invoice reconciliation and stock updates.
    
- Inter-store transfers.
    

Done when: both purchasing models work without double-counting stock or institutional expenditure.

Release 4

Operational accountability

Production, waste and cost reports

- Production runs and ingredient issues.
    
- Actual output and servings.
    
- Leftovers, waste and adjustments.
    
- Campus budgets and cost-per-meal reports.
    
- Consolidated institutional dashboard.
    
- CSV and printable reports.
    

Done when: the institution can compare campus operations using consistent metric definitions.

Release 5

Deployment readiness

Cloud and self-hosted release

- Reproducible Docker images and Compose configuration.
    
- Production migrations and rollback/recovery procedures.
    
- Backups, monitoring, health checks and operational documentation.
    
- API documentation and integration scaffolding.
    
- Load, security, isolation and end-to-end tests.
    

Done when: the same application release can be deployed to a cloud environment and a separate university server.

Release 6

Expansion

Advanced analytics and integrations

- Demand forecasting and suggested purchases.
    
- Supplier performance comparisons.
    
- SSO and accounting-system adapters.
    
- Optional student or hostel data integrations.
    
- Optional QR attendance and offline capabilities after their requirements are validated.
    

Done when: advanced features are useful additions, not dependencies for the core kitchen workflow.

## 10. Security and reliability acceptance checklist

Before allowing real institutions to use the application, test these requirements:

- A campus user cannot view another campus's private records.
    
- An institution administrator cannot access a different institution without an explicit, separately authorized grant.
    
- Changing IDs in URLs, API payloads, filters, or exports never bypasses authorization.
    
- Stock receipt, issue, transfer and adjustment operations remain consistent under concurrent requests.
    
- A failed purchase or receipt transaction cannot leave partial stock changes.
    
- Approved financial and inventory transactions retain their history.
    
- Retried API requests cannot create duplicate purchases or goods receipts.
    
- Revoked memberships and sessions stop working as expected.
    
- Sensitive information is restricted to authorized roles.
    
- Migrations work against both a fresh installation and a supported existing installation.
    
- A backup can be restored to a functioning application.
    
- Cloud and self-hosted deployments pass the same core test suite.
    

Also define a supported upgrade policy. A self-hosted customer should know which application versions can be upgraded directly, whether a backup is required, and how to recover if an upgrade fails.


## Final architecture decisions

|Decision|Final recommendation|
|---|---|
|Product|Independent Hostel Kitchen OS|
|Frontend|React + Next.js App Router + TypeScript|
|Backend|Next.js Route Handlers plus reusable domain services|
|Database|MySQL 8.4 LTS|
|ORM|MySQL-compatible Prisma ORM 7 release|
|Architecture|Modular monolith + separate worker|
|Multi-tenancy|Institution-level isolation from day one|
|Campus permissions|Explicit role and resource scopes|
|Procurement|Hybrid central and local|
|Cloud hosting|Containerized application and managed or securely operated MySQL|
|Self-hosting|Same application in a documented Docker deployment|
|Integrations|Versioned REST API and adapter-based architecture|
|Initial focus|Multi-tenant foundation, inventory, menus, procurement, production and reporting|

The most important thing is to build the institution/campus hierarchy and authorization model before building the kitchen features. Otherwise, retrofitting multi-tenancy later can force major changes to the database, APIs, and every screen.

With these foundations, Hostel Kitchen OS can start as a single university deployment and grow into a multi-institution product without needing separate codebases or depending on H2.
