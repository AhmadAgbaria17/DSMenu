# DSMenu

Phases 1–9 of a multi-tenant restaurant menu and table ordering SaaS. Next.js App Router, strict TypeScript, Tailwind CSS, MongoDB/Mongoose, next-intl, Auth.js, Pusher Channels and Cloudinary.

Implemented: database models, seed data, localized menu, table QR recognition, persistent carts, secure visits, order submission/history, staff authentication, live orders, service requests, private realtime updates, category/product management, restaurant settings and validated image uploads. Table lifecycle management and downloadable/printable QR cards are implemented in Phase 8. Phase 9 adds operational analytics. Payments and advanced business-intelligence features remain deferred. Protected table visits open the access-code gate; unprotected visits establish secure access directly. Restaurant Settings controls the mode for new visits. Only Send Order creates an order.

## Production Launch Checklist

Product customization is documented in [Product Options](docs/PRODUCT-OPTIONS.md), including staff setup, pricing/snapshot rules, backward compatibility and a Classic Burger smoke test.

Optional product sale pricing is documented in [Product Discounts](docs/PRODUCT-DISCOUNTS.md), including discount removal, option pricing, historical snapshots and regression coverage.

- [ ] Review source and staged files for secrets before publishing; this workspace has no Git history to audit.
- [ ] Provision separate production Atlas/Pusher/Cloudinary resources and canonical HTTPS origins.
- [ ] Run `npm run db:indexes` with the intended production database, then the insert-only `npm run create-restaurant -- --name "Restaurant Name" --slug restaurant-name` operator CLI.
- [ ] Create a unique owner with `npm run create-user`; supply its password only through the temporary `DSMENU_STAFF_PASSWORD` environment variable.
- [ ] Run `npm run check:production` with production variables. This is a syntax preflight, not a connectivity test.
- [ ] Deploy Node 24.x to Vercel, configure edge login rate limiting, verify real private realtime and signed image uploads.
- [ ] Configure real menu/tables, scan printed QR cards and complete the phone/tablet smoke test before handover.
- [ ] Verify backups/restoration, monitoring and restaurant fallback procedures.

See [the production runbook](docs/PRODUCTION.md) for exact safe commands, required environment names, deployment order, security limitations and the full handover checklist. No production data or external settings are changed by the preflight. Never seed production.

## Local setup

Use Node.js 24.x and MongoDB 7+ locally or MongoDB Atlas. Use a dedicated development database. Order submission requires a replica set because allocation and insertion use a transaction; Atlas supports this. A standalone MongoDB server can render the menu but cannot establish visits, submit orders, or manage table lifecycle transitions.

```powershell
npm ci
Copy-Item .env.example .env.local
# Edit MONGODB_URI in .env.local before proceeding.
npm run db:indexes
npm run seed
npm run dev
```

Open http://localhost:3000/r/salt?table=7. The page displays Salt and Table 7 without a selector. Open http://localhost:3000/r/salt to select a table manually. Invalid, repeated, foreign or inactive table numbers show a localized error instead of silently assigning another table. The QR identifies the table; it is not proof of physical presence or a session authorization token.

First visits use Arabic with `dir="rtl"`. The language switcher persists an HTTP-only SameSite cookie for one year. Hebrew uses RTL; English uses LTR. The URL stays `/r/salt?table=7`. The platform currently exposes all three languages; per-restaurant language configuration will be connected to settings in a later phase.

## Environment

| Variable | Current usage |
| --- | --- |
| `MONGODB_URI` | Required for restaurant pages, orders, seed and index scripts. Example: `mongodb://127.0.0.1:27017/dsmenu?replicaSet=rs0`. Use the Atlas connection string for Atlas. |
| `APP_URL` | Canonical QR origin. Local: `http://localhost:3000`. Production: `https://dsmenu.com`. |
| `AUTH_SECRET` | Required for staff authentication; generate a random secret of at least 32 characters. Never share or commit it. |
| `AUTH_URL` | Canonical site origin for Auth.js, e.g. `http://localhost:3000` or `https://dsmenu.com`. `NEXTAUTH_URL` is accepted only as a legacy fallback. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Reserved for image uploads; not read yet. |
| `REALTIME_APP_ID`, `REALTIME_KEY`, `REALTIME_SECRET`, `REALTIME_CLUSTER` | Pusher Channels app credentials and cluster. Configure all four for live updates. Only key/cluster reach the browser; the secret and app ID remain server-side. |

Never commit `.env.local` or secrets. Database errors show a generic localized page to visitors. No hardcoded data fallback conceals an unavailable database. The home page and build do not require MongoDB connectivity.

The insert-only seed creates Salt, tables 1–15, four translated categories and eight translated products. Rerunning it preserves existing edits and does not create duplicate seed records. It never deletes data, creates staff credentials or resets orders. The CLI refuses to seed when `NODE_ENV=production`.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration
npx playwright install chromium # one-time browser setup
npm run test:browser
```

Integration tests require the production build first. They download a MongoDB binary on the first run, start a disposable one-node replica set, start Next.js on port 3107, exercise real HTTP requests and transactions, then stop both processes. They never use your configured database. Internet access is required for the first binary download. Do not use port 3107 for another service while running this test.

Tests cover strict table query validation, translation parity/direction, model validation, insert-only seed reruns, unique table indexes, one active session per table, duplicate active service calls, tenant-scoped menu queries, invalid/inactive/foreign tables, inactive restaurants and product visibility.

Phase 2 unit tests also cover cart merging and note separation, quantity limits, removal, integer totals, serialization, malformed/foreign storage, stale product removal, current prices, localized search and image URL validation. `test:browser` reuses the disposable database and production server from the integration suite, then drives Chromium through real menu/cart flows. It checks refresh persistence, language switching, restaurant/table isolation, keyboard focus, storage failures and responsive widths. Screenshots are written to ignored `test-artifacts/`. Playwright is development-only; there are no new runtime dependencies.

## Local cart behavior

The route and restaurant header remain Server Components. `getPublicRestaurant()` returns explicit JSON-safe DTOs (`src/types/menu.ts`), with string IDs and no Cloudinary public IDs, timestamps or Mongoose objects. `MenuBrowser` supplies the interactive search, product cards and sheets. Search only uses the currently selected language and the already-loaded catalog.

`CartProvider` uses React Context and a pure reducer (`src/lib/cart.ts`). A line is identified by product ID and trimmed, case-sensitive note. Matching lines merge; different notes remain separate. Quantities are 1–99; notes are at most 300 characters; carts are limited to 100 lines. Only a validated table enables cart additions. Missing or invalid table parameters never share an anonymous cart.

Storage key: `dsmenu-cart:v1:<restaurantId>:<tableNumber>`. Its versioned envelope repeats the scope and stores only product IDs, quantities and notes. Loading checks the envelope with Zod, drops missing/unavailable products, clamps quantities and repairs malformed data without throwing into the UI. It ignores stored names/prices and always derives display names, images and prices from the current server catalog. Money arithmetic stays in integer agorot; `src/lib/money.ts` is the only display conversion.

Hydration begins with the same empty state on server and browser, restores storage after mount and saves only after restoration. Language changes retain the same cart provider identity and display the matching product translations. Blocked storage falls back to an in-memory cart with a localized warning. Storage events synchronize same-scope browser tabs using last-write-wins behavior; simultaneous multi-tab edits are not transactionally merged.

Reconciliation uses the latest menu loaded by a page request or server rerender; there is no background polling or realtime availability feed. Cart prices are a preview, not a quote. Submission reloads products, derives tenant/session authorization server-side, validates IDs and quantities, rejects unavailable items and calculates totals on the server. Failed/pending lines stay visible during mounted locale changes. Ordinary page-load reconciliation still removes stale selections with the existing warning. Never trust localStorage as authentication or a pricing source.

Product and restaurant images support existing HTTP(S) or local URLs with `next/image` and `unoptimized`, so the browser fetches external images directly. This intentionally avoids a wildcard server image proxy before trusted image hosting is configured. Images use lazy loading, fixed aspect ratios and error placeholders. Seed data is unchanged and may show placeholders. A trusted image CDN and optimized allowlist can be configured with the later upload phase.

The native `<dialog>` provides modal focus containment and Escape handling; the shared sheet restores focus and locks background scrolling. My Order includes Send Order and My Orders, with manual status refresh. Arabic, Hebrew and English cover confirmation, errors and every order status.

## Architecture and files

```text
src/
  app/                     Root layout, home, loading/error/not-found states
    r/[slug]/page.tsx       Database-backed restaurant/table entry point
  actions/locale.ts        Validated language cookie action
  components/shared/      Interactive language switcher and accessible sheet
  components/menu/        Header, image fallback, search/menu, cards and details
  components/cart/        Cart provider, floating button and My Order drawer
  i18n/                    Locale configuration and ar/he/en dictionaries
  lib/
    mongodb.ts             Cached, retryable Mongoose connection
    env.ts                 Lazy server environment validation
    qr.ts                  Canonical table URL generation
    cart.ts                Cart reducer, persistence and reconciliation
    menu.ts                Localized search, descriptions and image URL safety
    money.ts               Centralized minor-unit currency display
    validators/common.ts   Shared Zod input schemas
    services/restaurant.ts Public restaurant query and tenant-scoped projection
  models/                  Restaurant, User, Table, TableSession, Category,
                           Product, Order, ServiceCall and schema helpers
  types/domain.ts          Language and lifecycle constants
  types/menu.ts            Public serializable menu DTOs
scripts/                   Insert-only demo seed and additive index setup
tests/                     Unit tests and MongoDB/HTTP integration checks
```

Root configuration: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`.

All monetary values (`price`, `subtotal`, `itemTotal`) are integer **agorot**, so 4800 means ₪48.00. The UI converts minor units only for display. Orders snapshot all three product names, price, quantity, notes, totals and currency. Historical data has no TTL or automatic deletion. Payment fields can be added later without changing item snapshots.

Table numbers have a unique compound index with restaurant ID. Active table sessions use a partial unique index; closed sessions remain in history. Order numbers are unique within a table session, with a separate idempotency constraint. Phase 3 uses these existing indexes without adding or dropping indexes. Service calls enforce one unresolved request of each type per session; service call workflows and staff lifecycle transitions belong to later phases.

`User.passwordHash` is excluded from queries by default and accepts bcrypt-shaped hashes. Phase 4 hashes passwords server-side and derives dashboard tenant IDs exclusively from verified Auth.js sessions. There are no public signup or restaurant-management mutation endpoints.

Mongoose references do not enforce foreign keys. Services must verify all referenced records belong to the authorized tenant before writes. Current public reads derive the restaurant from an active slug and scope tables, categories and products to that restaurant; they also exclude products referencing another restaurant's categories.

Production automatically disables Mongoose index creation. Run `npm run db:indexes` explicitly before serving traffic. This adds indexes without dropping existing ones; duplicate historical records must be resolved before applying unique indexes.

## Phase 3: visits and orders

`GET /api/r/[slug]/tables/[table]/session` returns CREATE, JOIN, OPEN or authorized entry state without exposing the code. `POST` accepts a validated CREATE code or JOIN code plus current session ID for protected visits, or OPEN for unprotected visits. An empty JSON object only resumes an already-valid credential; it cannot create or join. Concurrent creators produce one winner; the loser receives 409 and switches to JOIN. Legacy authorized devices can use SETUP for their existing code-less visit. See [Table Access](docs/TABLE-ACCESS.md) for throttling and rollout behavior. Each browser gets an independent random 256-bit token. MongoDB stores only its SHA-256 digest and expiry in a hidden `credentials` array. The cookie is named `dsmenu-visit-<restaurantId>-<tableNumber>`, scoped to that table's API path, HttpOnly, SameSite=Lax, Secure in production, and expires after 12 hours. It is never placed in localStorage or JSON responses. Expiry removes credential access, not historical visits; no TTL is used.

`GET /api/r/[slug]/tables/[table]/orders` resolves the active visit from that credential. It returns only explicit DTOs for that restaurant/table/visit, with string IDs/dates and translated snapshot names. It does not accept a session ID query parameter. Browsers sharing a table's active visit see the same orders. Closed or expired credentials cannot read or submit orders. After closure, the new visit follows the current restaurant preference: protected visits show CREATE, while unprotected visits open directly; sending an order never silently establishes one.

`POST` to the same orders endpoint accepts `{ clientRequestId, items: [{ productId, quantity, note }] }`. Zod strips untrusted prices, names and tenant/session identifiers. Within a short transaction, the service rechecks the active credential, checks idempotency, loads tenant-owned available/non-archived products and active tenant-owned categories, and calculates integer agorot totals. Rejection is all-or-nothing and identifies affected product IDs. Price changes are accepted at the database price; the UI explains this before sending and displays the confirmed total afterward. Product names in all three languages, unit price (`price` in the existing model), quantity, notes, item totals and currency are snapshotted.

Order allocation atomically increments `TableSession.nextOrderNumber`; `Order.create()` and `lastActivityAt` update share the same transaction. Failure rolls back allocation. Concurrent transactions serialize on the visit document; the MongoDB driver retries transient transaction conflicts. An additional duplicate-key retry starts a fresh transaction to find the winning order. The existing unique indexes enforce both session order numbers and `(restaurantId, tableSessionId, idempotencyKey)`. A hidden request fingerprint rejects reuse of the same UUID for a different selection. An identical retry returns its original snapshot even if products subsequently change.

The browser immediately locks duplicate clicks and cart editing while submitting. A versioned localStorage journal saves the request UUID, visit ID and minimal items under the cart key plus `:submission`; it contains no credential or trusted pricing. Network/5xx failures retain this exact request across reloads. Retry sends the same payload/key. Confirmed success subtracts only submitted quantities, records the confirmation UUID in the cart, then removes the journal after persisting the receipt. This avoids clearing newly added items after replay. A pending request from a previous visit cannot be silently sent to a new visit. A confirmation dialog allows customers to unlock an uncertain selection after checking history/staff. If browser storage is blocked, this protection survives in memory only; the cart warns that navigation loses persistence.

Security boundaries: every read/write derives the tenant from the slug and table, and requires a matching credential for orders. POST endpoints enforce same-origin requests; responses are private/no-store; error logs omit bodies, tokens and connection strings. Payloads are capped at 100 KB, 100 lines, quantity 1–99 and 300-character notes. A visit supports at most 32 unexpired device credentials and 100 orders; these durable bounds avoid unbounded records without Redis. They are not a full IP rate limiter. Add provider-level request throttling around these route handlers when deploying publicly.

The public table URL deliberately allows a new device to join an active visit. Consequently, anyone who knows that URL can obtain their own credential and see that table's current orders. Opaque credentials prevent direct unauthorized order requests and cross-table credential reuse, but do not prove physical presence or stop a remote person from joining through the public bootstrap endpoint. Stronger admission would require signed/private QR links or staff approval; that is outside this phase. Do not collect sensitive personal information in item notes.

### Local replica set

Atlas needs no local MongoDB setup. For a fresh local development instance, install MongoDB Server and `mongosh`, then start this in a separate PowerShell terminal. If port 27017 is already occupied, configure your existing instance as a replica set or choose another port consistently; do not launch a second process against its data directory.

```powershell
New-Item -ItemType Directory -Force .local-mongo
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath .local-mongo
```

In another terminal, initialize once:

```powershell
mongosh --host 127.0.0.1 --port 27017 --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

Set `MONGODB_URI=mongodb://127.0.0.1:27017/dsmenu?replicaSet=rs0` in `.env.local`, then run indexes, seed and dev as above. Use HTTPS in production for Secure cookies. No Auth.js secret or realtime/upload credentials are required for Phase 3.

### Manual verification

1. Open `/r/salt?table=7`, select a language, add Burger + Cola with an item note, and open My Order.
2. Send Order. Verify confirmation, the final total, Received status and an empty cart. Refresh the page: the submitted order remains under My Orders.
3. Add another item and send again: Order #2 belongs to the same visit. Check `orders` and `tablesessions` in your development database.
4. Inspect browser cookies: the table cookie is HttpOnly and scoped to its API path. LocalStorage contains only the cart, confirmation receipt and any pending submission journal. MongoDB credentials contain hashes, not cookie values.
5. To simulate future staff changes, use your development database UI to change that Order's status to `PREPARING`, then press Refresh status. No customer endpoint can change status.
6. Put an item in the cart, change that Product's `isAvailable` to false in the development database, then send without reloading: the request fails, the item is marked, and no partial order is stored. Restore availability afterward.
7. Mark this development TableSession `CLOSED` with `closedAt` set. Sending from the already-open page fails and preserves the cart. With access-code protection enabled, reload shows CREATE; choose a new code to start a new active visit. The closed session/orders remain stored.

`tests/orders.test.ts` adds validation, credential hashing, fingerprint, durable retry journal and confirmed-cart reducer tests. `tests/order-http.ts` covers credential/tenant isolation, concurrent creation/submission, price forgery, all-or-nothing validation, idempotency, snapshots, expiry/closure and rollback after an actual insert failure. `tests/order-browser.ts` covers real submission, delayed confirmation, lost response after commit followed by reload/retry, manual status refresh, failed cart retention and RTL. Previous Phase 1/2 tests remain; their browsing assertion now expects visits for newly opened tables while still forbidding automatic orders/service calls.

### Phase 3 file map

Created:
- `src/app/api/r/[slug]/tables/[table]/session/route.ts` and `orders/route.ts`
- `src/lib/services/customer-session.ts`, `customer-orders.ts`
- `src/lib/customer-security.ts`, `customer-path.ts`, `customer-errors.ts`, `customer-http.ts`, `submission.ts`
- `src/lib/validators/orders.ts`, `src/types/orders.ts`
- `src/components/orders/orders-provider.tsx`, `customer-orders.tsx`
- `tests/orders.test.ts`, `tests/order-http.ts`, `tests/order-browser.ts`

Modified:
- `src/models/TableSession.ts`, `src/models/Order.ts`
- `src/lib/cart.ts`, `src/components/cart/cart-provider.tsx`, `my-order.tsx`
- `src/components/menu/menu-browser.tsx`, `product-details.tsx`
- `src/i18n/messages/ar.json`, `he.json`, `en.json`
- `tests/integration.ts`, `tests/browser-flows.ts`
- `.env.example`, `.gitignore`, `README.md`

Phase 3 added no dependencies. Authentication and the dashboard foundation are added in Phase 4 below; employee status controls, realtime, service bells, uploads, menu management, QR management UI and payments remain deferred.

## Phase 4: employee authentication and dashboard

Routes: `/login`, `/dashboard`, `/dashboard/[section]`, `/api/auth/[...nextauth]`. Login/logout and all dashboard strings support Arabic (default), Hebrew and English using the existing cookie and RTL/LTR infrastructure. The responsive dashboard uses a sidebar on tablets/desktops and horizontally scrollable navigation on small screens. Only Overview is implemented; navigation destinations explicitly say they are not implemented.

Dependencies added: pinned `next-auth@5.0.0-beta.32` and `bcryptjs@3.0.3`. [Auth.js's documented App Router setup](https://authjs.dev/getting-started/installation) currently uses its v5 beta; the version is pinned to avoid an accidental prerelease upgrade. Credentials is the only provider. No MongoDB adapter is needed: the existing Mongoose User collection remains authoritative. `bcryptjs` is bcrypt-compatible, includes TypeScript declarations, and avoids native build dependencies.

### Secrets and origin

Add `AUTH_SECRET` and `AUTH_URL` to your existing `.env.local`. Generate a secret locally, copy the output into `.env.local`, and keep it private:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

```dotenv
AUTH_SECRET=your-generated-secret
AUTH_URL=http://localhost:3000
```

Use `AUTH_URL=https://dsmenu.com` in production and serve staff routes over HTTPS. The configured origin pins Auth.js requests/redirects rather than trusting an arbitrary client Host header. If `AUTH_URL` is absent, the existing `NEXTAUTH_URL` variable is supported. The config lazily requires a 32+ character secret and an HTTP(S) origin with no path, query or embedded credentials. Missing auth configuration fails closed; public customer routes and production build remain independent of it. Your `.env.local` was not modified by this implementation.

### Passwords and creating employees

The administrative CLI takes an **existing active restaurant slug**; it never creates a restaurant, exposes public registration, resets an existing user or installs a default password. Run indexes and the Salt seed first. The existing unique email index is required. Email is trimmed/lowercased consistently in the input schema and Mongoose model. Passwords are salted bcrypt hashes with cost 12. Creation requires at least 12 characters and at most 72 UTF-8 bytes; longer passwords are rejected rather than silently truncated. Password whitespace is preserved.

PowerShell example (password input is hidden and is not put in command history):

```powershell
$staffPassword = Read-Host 'New employee password (12+ characters)' -AsSecureString
$staffPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($staffPassword)
try {
  $env:DSMENU_STAFF_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($staffPasswordPointer)
  npm run create-user -- --restaurant salt --name 'Salt Owner' --email admin@salt.local --role OWNER
} finally {
  Remove-Item Env:DSMENU_STAFF_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($staffPasswordPointer)
  $staffPassword.Dispose()
}
```

Use `--role STAFF` for staff (also the default). Both roles currently have the same access. The CLI reads the password from the process environment and prints only the created email/role. Do not store `DSMENU_STAFF_PASSWORD` in a committed file or pass it as a command-line argument. Standard `npm run seed` still creates no employee credentials. Repeating `create-user` with an existing normalized email fails without changing it. CLI errors omit values, hashes and database connection details.

### Sessions, tenant isolation and logout

Auth.js uses encrypted JWT sessions with an 8-hour max age in its HttpOnly, SameSite=Lax cookie (Secure in production). Auth.js manages cookie encoding and its built-in CSRF double-submit protection. Tokens are never stored in localStorage. Customer visit credentials/cookies and staff cookies remain separate.

The browser-visible session contains only `user.id`, `user.restaurantId`, `user.role`, `user.name`, `user.email`, and `expires`. The JWT also includes an internal `authVersion`. Credentials login explicitly selects `passwordHash`; normal model queries exclude it. Authentication errors are generic for missing accounts, wrong passwords and inactive users/restaurants. Logs report error types without credentials or raw Auth.js error details. Unknown users still perform a bcrypt comparison. A bounded process-local throttle allows 10 attempts per normalized email per 15 minutes; it is supplementary protection, not a shared rate limit. Configure ingress/provider throttling before public deployment to cover IP abuse and multiple application instances.

Each JWT evaluation reloads the user and checks active state, restaurant ownership, version and active restaurant. Role/name/email are refreshed from MongoDB. A disabled/deleted user, moved tenant, inactive restaurant or revoked version fails closed on the next protected server request. Database outages also fail closed. Already rendered information remains on screen until another server request; no realtime revocation UI is implemented. Re-enabling an account can allow an otherwise unexpired token again; increment `authVersion` when permanent revocation is intended.

`requireStaffSession()` wraps `auth()` and redirects unauthenticated users to `/login`. React `cache()` deduplicates it only within the current server render. The protected layout uses it, and each data service and placeholder page independently enforces it: hiding navigation or relying only on a layout is not authorization. `getDashboardOverview()` takes **no restaurant argument**; its table, visit, order and service call counts always filter by `restaurantId` from trusted auth. Query strings, form values and session-update payloads cannot change that tenant. Redirects only target the configured origin's `/dashboard` or `/login`. Next.js may issue an HTTP redirect or an equivalent streamed redirect; neither contains protected dashboard data.

Logout clears the cookie and increments `User.authVersion` in MongoDB. All earlier JWTs for that employee (including copied cookies and other devices) then fail the version check. This deliberately signs that employee out everywhere without adding session collections or Redis. The signout event needs database availability to persist revocation; Auth.js still clears the local cookie if that database write fails and logs a sanitized error. A future per-device session store can replace this policy if needed. Existing User documents without `authVersion` are treated as version 0; no data migration or new index is required. For an administrative password reset, update the hash and increment this version together.

### Overview and manual checks

Overview shows enabled table count (occupied or not), active visits, NEW orders and unresolved service calls. Every number is a database snapshot at request time; reload updates it. No daily timezone analytics, order controls, service-call actions or realtime are implied by these counts.

1. Configure auth variables, run `npm run db:indexes`, `npm run seed`, create an employee as above, then `npm run dev`.
2. Open `/dashboard` while signed out: it redirects to `/login`. Arabic/RTL is the default; switch to English or Hebrew and verify labels/direction.
3. Try an incorrect password: the generic error is shown. Log in with your employee's credentials: Salt and its scoped summary appear.
4. Add `?restaurantId=another-id` to `/dashboard`: it still shows Salt. Open Products or Tables: the protected page is clearly marked not implemented.
5. Log out, then reopen `/dashboard` or a dashboard child route: login is required again. Logout also revokes sessions for that employee on other devices.
6. In a dedicated development database, set that User's `isActive` to false while signed in and reload: access is denied. An inactive Restaurant also denies login and protected requests. Restore those flags afterward.
7. Recheck `/r/salt?table=7`: customer cart, secure visits and order submission continue independently of staff login.

Phase 4 tests add real Auth.js CSRF/login/session/update/logout HTTP requests, cookie tampering and replay, generic failures, duplicate normalized email, both roles, foreign-tenant query injection, exact tenant counts, inactive/moved users and inactive restaurants. Browser checks cover redirect/login/logout, Arabic/Hebrew/English, responsive widths, HttpOnly cookies and placeholders. Tests use disposable MongoDB plus randomly generated test-only credentials/secrets; they never use your configured database. All Phase 1–3 tests remain enabled.

### Phase 4 file map

Created:

- `src/lib/auth.ts`, `staff-context.ts`, `password.ts`, `staff-users.ts`, `staff-login-throttle.ts`, `dashboard-navigation.ts`
- `src/lib/validators/staff.ts`, `src/lib/services/staff-auth.ts`, `dashboard.ts`
- `src/types/next-auth.d.ts`
- `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`
- `src/app/dashboard/layout.tsx`, `page.tsx`, `loading.tsx`, `[section]/page.tsx`
- `src/components/auth/login-form.tsx`, `logout-button.tsx`, `src/components/dashboard/navigation.tsx`
- `scripts/create-user.ts`
- `tests/staff.test.ts`, `staff-http.ts`, `staff-browser.ts`

Modified:

- `src/models/User.ts`, `src/lib/env.ts`
- `src/i18n/messages/ar.json`, `he.json`, `en.json`
- `tests/integration.ts`
- `package.json`, `package-lock.json`, `.env.example`, `README.md`

## Historical roadmap

The Phase 5, 6, 7 and 8 sections below document the implemented progression. See Phase 8 for the current next-step recommendation.

## Phase 5: live orders and private realtime

`/dashboard/orders` now loads authoritative data on the server, groups distinct orders by table visit, and provides large status buttons, age labels, active-status filters and recent history. NEW and PREPARING appear in the active queue (legacy ACCEPTED is treated as preparing). READY/SERVED/CANCELLED leave that queue but remain in the database; History shows the latest 100 completed orders by update time. All active orders are loaded; pagination of large active queues is a future scaling improvement. No records are deleted. The customer My Orders view updates automatically and retains its manual refresh button. All UI strings support Arabic/Hebrew/English and logical RTL/LTR layouts.

### Pusher setup and deployment

Pusher Channels is the only realtime provider. Its [private-channel authorization](https://pusher.com/docs/channels/server_api/authorizing-users/) and short HTTP publishing calls fit Next.js on Vercel without a persistent application WebSocket server. Added dependencies: `pusher@5.3.4` (server SDK) and `pusher-js@8.6.0` (browser SDK). The dependency audit also identified a critical advisory in the existing Next.js 16.3.5 release; Next.js and eslint-config-next were patched to 16.3.6. The resulting installation audit reported zero vulnerabilities.

Create a Pusher **Channels** app in your own account, choose its cluster, leave client events disabled, and copy its credentials into `.env.local`:

```dotenv
REALTIME_APP_ID=your-numeric-app-id
REALTIME_KEY=your-app-key
REALTIME_SECRET=your-server-secret
REALTIME_CLUSTER=your-cluster
```

No provider account or credentials were created by this implementation, and your existing `.env.local` was not changed. Automated tests use a local fake provider transport; a real Pusher account must be configured for deployment. No `NEXT_PUBLIC_*` variables are needed: authorized server responses supply only the public key, cluster and exact permitted channel. This avoids separate build-time keys getting out of sync with runtime server settings. Never expose `REALTIME_SECRET` or `AUTH_SECRET` in client variables.

On Vercel, set all four variables separately for the intended production/preview environments along with `AUTH_SECRET`, canonical HTTPS `AUTH_URL`, `APP_URL`, and Atlas `MONGODB_URI`. Use separate Pusher apps for production and preview where possible. Redeploy after environment changes. API routes use the Node.js runtime; there is no custom socket server, Redis or polling worker to deploy. Allow outbound HTTPS to the provider and browser WSS connections to the chosen Pusher cluster if you configure a CSP/firewall. Keep the MongoDB replica set/Atlas and existing indexes. The optional status timestamps require no index migration.

If all realtime variables are blank, the UI clearly reports that live transport is unavailable and still revalidates every 30 seconds while visible, on focus/online and manually. A partial/invalid configuration is rejected for subscription authorization and logged without secrets. Existing business operations still succeed. These fallbacks do not claim that an unconfigured provider is connected.

### Authorization and channel boundaries

Staff subscribe to `private-restaurant-<restaurantId>`. `POST /api/dashboard/realtime` verifies the current Auth.js user/restaurant through the existing database-backed checks, derives the expected channel from that session, and compares it exactly with the requested channel before signing. Customers cannot use that endpoint without staff authentication.

Customers subscribe to `private-table-session-<visitId>`. Their authorization endpoint is `/api/r/[slug]/tables/[table]/realtime`, inside the existing credential cookie path. It derives the active restaurant/table, checks the opaque HttpOnly credential hash, expiry and ACTIVE visit, then matches the exact visit channel. Neither a raw visit ID, table number nor a channel name alone authorizes subscription. Closed/expired visits are refused. Staff credentials do not authorize arbitrary customer channels. Both endpoints require same-origin POSTs, bounded JSON and valid socket/channel inputs. Responses are private/no-store.

Private subscriptions are authorized when joining, not continuously by the provider. Clients renew the connection every five minutes and reauthorize on reconnect. Every event-triggered HTTP read independently checks current authorization, so inactive staff and closed visits cannot fetch order data even before the socket disconnects. Existing subscriptions can receive a data-free change signal until disconnect/renewal; **no order IDs, table IDs, status, prices, notes, names or tokens are included in events**. The only event payload is `{ "version": 1 }`. This makes revocation safe for business data without maintaining server connection registries. The original public-QR admission limitation still applies: a person knowing a table URL can join its active visit through the public bootstrap flow.

### Database truth, transitions and concurrency

The service exposes tenant-scoped `getRestaurantOrders()` and `updateOrderStatus()`; both obtain authenticated context internally. Client tenant fields are ignored. DTOs reuse the Phase 3 snapshot converter and serialize IDs/dates, table number, visit ID and notes without Mongoose internals or staff fields. Status mutations are same-origin PATCH requests with `{ expectedStatus, status }`.

Allowed transitions are centralized in `src/lib/order-flow.ts`:

Multiple NEW table orders now share one operational card and transition together; a lightweight preparation ID preserves membership after starting. See [Preparation groups](docs/PREPARATION-GROUPS.md) for transactional boundaries, compatibility and testing. Historical Orders and billing remain individual.

```text
NEW → PREPARING → READY
  ↘ CANCELLED      
Legacy ACCEPTED → READY or CANCELLED
```

Staff use only Start preparing and Mark ready. Cancellation is a secondary, confirmed action for NEW or legacy ACCEPTED; PREPARING/READY cannot be cancelled. READY is terminal and remains in recent history, analytics and the final bill. It does not close the visit. ACCEPTED and SERVED remain in the enum for historical compatibility without a migration; unfinished ACCEPTED displays as preparing and can be marked ready. The server validates transitions regardless of buttons. The atomic MongoDB update matches order ID, authenticated restaurant and `expectedStatus`; competing requests cannot both win. Stale updates return 409 and reload the queue. Missing/foreign orders receive the same 404. New transitions write preparingAt/readyAt/cancelledAt; historical timestamps remain untouched.

`order.created` is published only after the Phase 3 transaction commits, outside the retried callback. Idempotent retries return the stored order without another created event. `order.status.updated` publishes only after a successful conditional update. Both notify only the relevant restaurant and visit channels. Publishing is awaited with a three-second SDK timeout and errors are caught: a provider failure never rolls back a valid order/status update or changes a successful response into an error. Logs omit credentials and provider URLs.

There is deliberately no durable event outbox or guaranteed event delivery. A process can stop between committing MongoDB and publishing. Periodic/focus/reconnect re-fetches recover the authoritative state, including in that case. Notification failure is not business failure.

### Client recovery and audio

The initial server snapshot renders before subscription. Successful subscription/reconnection triggers a fresh, silent snapshot to cover missed events; listeners also re-fetch on order signals. Existing cards remain visible during connection failures. The browser checks while visible every 30 seconds and on focus/online; manual refresh remains available. Request sequence guards prevent older responses overwriting newer state, and reads are reconciled after staff mutations. Customer automatic refresh does not discard cart errors or pending idempotency attempts.

Staff sound uses a short Web Audio tone, never a loop or external audio file. The dashboard offers an explicit Enable sound button to satisfy browser autoplay policy. Preference is saved per restaurant in localStorage. Previously enabled audio still requires a fresh interaction after reload; a suspended audio context returns to the enable state. Sound-off persists. There is at most one sound per batch of previously unseen NEW order IDs. Initial/reconnect snapshots seed the seen set silently, and rerenders, duplicate events, updates and history visits never replay known orders. Deduplication is per open dashboard; two different tablets may each alert once.

### Manual live-flow test

1. Configure Pusher, MongoDB and staff auth; create a Salt employee using the Phase 4 instructions, then run `npm run dev`.
2. Log in on a tablet/browser and open `/dashboard/orders`. Wait for the connected label and press Enable sound once.
3. In a separate customer browser/profile, open `/r/salt?table=7`, add Burger + Cola and an item note, and send. The staff queue should update automatically and play one short tone.
4. Press Accept, Start preparing, Mark ready and Mark served. Watch the customer's My Orders status change automatically after each action.
5. Confirm Served disappears from All active and remains in Recent history. Submit another customer order and verify it is a separate order in the same visit group.
6. Toggle sound off and submit again: the card should appear without audio. Switch Arabic/Hebrew/English and check direction/labels.
7. Disconnect/reconnect a client. The visible state should remain, then reconcile without replaying alerts for known orders. Temporarily disable provider delivery and verify a manual/periodic refresh still finds committed orders.
8. In two staff browsers, attempt competing actions on the same NEW card. One succeeds; the stale request reports a conflict and refreshes.

### Tests and Phase 5 files

Run all standard checks listed above, including both integration and browser suites. The local test transport captures real Pusher SDK publishing requests after database commit and verifies genuine authorization signatures for simulated WebSocket subscriptions. It runs exclusively through `tests/pusher-preload.cjs` and Playwright routing; application code has no mock environment switch, socket server or authorization bypass. No live provider credentials or development database are used. Provider account configuration/connectivity still needs the manual deployment check above.

Created:

- `src/app/dashboard/orders/page.tsx`
- `src/app/api/dashboard/orders/route.ts`, `orders/[id]/route.ts`, `realtime/route.ts`
- `src/app/api/r/[slug]/tables/[table]/realtime/route.ts`
- `src/components/dashboard/live-orders.tsx`, `order-card.tsx`
- `src/hooks/use-order-realtime.ts`, `use-order-sound.ts`
- `src/lib/order-flow.ts`, `order-dto.ts`, `realtime-channels.ts`, `realtime.ts`, `realtime-client.ts`, `staff-http.ts`
- `src/lib/services/staff-orders.ts`, `src/types/live-orders.ts`
- `tests/live.test.ts`, `live-http.ts`, `live-browser.ts`, `realtime-transport.ts`, `pusher-preload.cjs`

Modified:

- `src/lib/services/customer-orders.ts`, `src/lib/env.ts`, `src/models/Order.ts`, `src/types/orders.ts`
- `src/components/orders/orders-provider.tsx`, `customer-orders.tsx`
- All three `src/i18n/messages/*.json` dictionaries
- `tests/integration.ts`, `browser-flows.ts`, `order-browser.ts`, `staff-browser.ts`, `staff-http.ts` (transport setup and reusable authenticated test client; existing assertions retained)
- `package.json`, `package-lock.json`, `.env.example`, `README.md`

No service-call/bill/help UI, menu/category/product/table CRUD, uploads, QR management, payments, permission differences or advanced analytics were added.

## Phase 6: customer service calls

The customer menu now includes a Service sheet with Waiter, Bill and Help actions. `/dashboard/service-calls` groups active requests by table visit and offers acknowledgement, resolution and the 100 most recently resolved calls. Older records remain in MongoDB. A persistent dashboard header badge shows the active count on every dashboard page. Arabic, Hebrew and English include all new labels and RTL layouts.

### Authorization, duplicates and cooldown

Customer GET/POST `/api/r/[slug]/tables/[table]/service-calls` uses the existing HttpOnly hashed visit credential, expiry, active restaurant/table and ACTIVE visit checks. A table URL alone cannot read or create calls through this API. Query parameters and extra POST fields are rejected; the only accepted creation field is `type`. Public QR admission remains unchanged: anyone who knows the URL can establish a visit credential through the existing bootstrap endpoint.

The partial unique index allows one PENDING/ACKNOWLEDGED call of each type per visit. Duplicate taps return the existing call with `alreadyPending: true`, without publishing another event. A **30-second cooldown per type per visit** starts at the previous call's `createdAt`. Resolving the call does not reset or remove this cooldown. If resolved within 30 seconds, another request receives HTTP 429 with `retryAt` and `Retry-After`. After 30 seconds a resolved type may be requested again; an unresolved type remains blocked indefinitely until staff resolves it. Different types may coexist and do not block each other.

Creation runs in a MongoDB transaction. An increment of the visit's `serviceCallSequence` serializes competing requests and visit closure; it is an internal concurrency counter, not a displayed order number. The transaction reads the most recent call timestamp and writes the new call together. Duplicate-key races retry in a fresh transaction and reauthorize. No Redis or new dependencies are required.

Staff services obtain the restaurant from current Auth.js authentication internally. Reads and table lookups are tenant-scoped. PATCH accepts only `expectedStatus` and `status`. Allowed transitions are PENDING to ACKNOWLEDGED, PENDING to RESOLVED, and ACKNOWLEDGED to RESOLVED. Terminal calls cannot reopen. Atomic updates match ID, authenticated restaurant and expected status; stale updates return 409 and foreign/missing IDs return the same 404. Acknowledgement and resolution timestamps are preserved.

### Realtime, recovery and sound

The existing Pusher provider, credentials and authorization endpoints are reused. `serviceCall.created` publishes after transaction commit; `serviceCall.updated` publishes after the conditional update. Both carry only `{ "version": 1 }` on the existing private restaurant and private visit channels. Authorized APIs supply DTOs after each signal. Notification failures are logged without sensitive details and never roll back business data.

One persistent dashboard activity provider owns the staff subscription, active service count, service snapshot and shared sound control. Live Orders consumes its invalidations and sound controller. Customer service state consumes invalidations from the existing customer visit subscription; no second customer socket is introduced. Acknowledgement/resolution updates appear automatically. Periodic visible-page, focus/online, reconnect and manual refresh retain the existing Phase 5 fallback behavior. There is no guaranteed-delivery outbox; MongoDB remains authoritative.

Initial/reconnect snapshots are silent. Known service IDs never replay a tone; multiple new calls in one response produce one brief alert. The existing restaurant-specific sound preference and explicit enable interaction are shared with orders. Tones are scheduled sequentially to avoid overlap. Sound deduplication is per open dashboard, not across separate staff tablets.

### Deployment and manual test

Run `npm run db:indexes` before deploying to create the additive restaurant/visit/type/creation-time service lookup index. Existing uniqueness indexes remain unchanged. The new visit counter needs no data migration: MongoDB initializes missing counters on increment. Atlas/a replica set remains required for transactions. No new environment variables are needed; retain Phase 5 Pusher settings and do not expose secrets with `NEXT_PUBLIC_`.

1. Start the app with the existing MongoDB/auth/Pusher configuration. Log in as Salt staff, open `/dashboard/service-calls`, wait for connected status and enable sound.
2. In another browser open `/r/salt?table=7`, select Service and Call Waiter. Confirm one card, one tone and a disabled pending customer action.
3. Acknowledge it and watch the customer status change. Resolve it; confirm it leaves Active requests and remains in Recent history.
4. If fewer than 30 seconds have elapsed since creation, the customer sees a countdown. After that interval, request the waiter again and confirm a separate record.
5. Request Bill and Help. Confirm separate active calls under the same table visit. Disable sound and repeat after resolution/cooldown.
6. Navigate to Overview or Live Orders and send another service request. The persistent badge and service sound still work. Confirm the normal customer order/status flow remains intact.
7. Switch Arabic/Hebrew/English, test a narrow phone and tablet, and disconnect/reconnect to verify silent reconciliation.

Automated HTTP/browser checks use the existing disposable replica set and local Pusher transport. They verify secure credentials, tenant isolation, creation races, cooldown, transitions, timestamps, post-commit events, provider failures, history, sound dedupe/mute and a two-browser customer/staff flow. Test-only timestamp adjustments avoid waiting 30 seconds; production cooldown logic is unchanged. No production database or live Pusher is used by these suites.

### Phase 6 file map

Created:

- `src/types/service-calls.ts`
- `src/lib/service-flow.ts`, `src/lib/service-dto.ts`
- `src/lib/services/customer-services.ts`, `src/lib/services/staff-services.ts`
- `src/app/api/r/[slug]/tables/[table]/service-calls/route.ts`
- `src/app/api/dashboard/service-calls/route.ts`, `src/app/api/dashboard/service-calls/[id]/route.ts`
- `src/app/dashboard/service-calls/page.tsx`
- `src/components/menu/service-actions.tsx`
- `src/components/dashboard/activity-provider.tsx`, `src/components/dashboard/service-calls.tsx`
- `tests/services.test.ts`, `tests/service-http.ts`, `tests/service-browser.ts`

Modified:

- `src/models/ServiceCall.ts`, `src/models/TableSession.ts`
- `src/lib/realtime.ts`, `src/lib/realtime-channels.ts`, `src/lib/realtime-client.ts`
- `src/hooks/use-order-sound.ts`
- `src/app/dashboard/layout.tsx`, `src/components/dashboard/live-orders.tsx`
- `src/components/orders/orders-provider.tsx`, `src/components/menu/menu-browser.tsx`
- `src/i18n/messages/ar.json`, `he.json`, `en.json`
- `tests/integration.ts`, `tests/realtime-transport.ts`, `README.md`

At the end of Phase 6, menu/category/product CRUD and uploads were deferred to Phase 7, described below.

## Phase 7: menu management and Cloudinary

`/dashboard/categories` creates/edits all three translated names, active state and numeric sort order. Deactivation hides the category and its products without deleting either. There is deliberately no category hard-delete endpoint. Category images are optional and appear above their public menu section.

`/dashboard/products` creates/edits translated names/descriptions, category, price, availability, featured state and sort order. Available and Featured have quick list toggles. Archive/restore requires confirmation; archived records and their image assets remain stored, but products disappear from the public menu and cannot be ordered. Historical order snapshots are unchanged. The archived-products view allows recovery.

`/dashboard/settings` edits name, description, phone, WhatsApp, address, HTTPS map/Instagram links and primary color, plus separate logo/cover upload, replacement and removal controls. The public header displays these settings. Slug, tenant identity, currency, credentials and roles are not editable through these endpoints.

### Pricing, sorting, validation and tenant scope

Prices enter the API as decimal strings. `priceInput` in `src/lib/validators/menu-management.ts` splits whole/fractional digits and builds integer agorot: `48` becomes `4800`, `19.90` becomes `1990`, `5.50` becomes `550`. Negative values, exponents, comma decimals and more than two decimal places are rejected. The existing model maximum of 100,000,000 agorot is preserved. `priceForInput` formats stored integers for editing; no floating-point price is persisted.

Sort controls accept integers from 0 to 100,000. Lower values appear first; products are ordered inside their category. Equal values retain the existing ObjectId tie-breaker. This avoids a drag-and-drop dependency and complex reorder transactions.

All three names are required, trimmed and bounded at 160 characters. Descriptions are optional, trimmed and bounded at 2,000 characters. Strict Zod payloads reject tenant IDs, image references and unknown fields. Product category assignment checks authenticated tenant ownership, including when editing. All product/category lookups and updates match both ID and the server-authenticated restaurant. Missing and foreign records return the same 404. Writes require same-origin requests. Existing Auth.js active-user/restaurant checks and OWNER/STAFF behavior are reused unchanged.

### Cloudinary setup and upload flow

Add these **server-only** values to `.env.local` and the corresponding Vercel environment:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Do not prefix these variables with `NEXT_PUBLIC_`. The browser receives saved delivery URLs, never the secret or an upload signature. Configuration is validated lazily when uploading/cleaning assets; unrelated routes/builds do not require Cloudinary. Existing `.env.local` credentials were not changed.

The reusable ImageUpload component sends the raw file body to authenticated `POST /api/dashboard/images/[kind]/[id]`. The server resolves and verifies the target before reading the body. It limits actual streamed bytes to **4,000,000**, below Vercel's [4.5 MB function request limit](https://vercel.com/docs/functions/limitations). JPEG, PNG and WebP still images are accepted; SVG, GIF, AVIF, animated and undecodable files are rejected. MIME and decoded format must match. Sharp limits inputs to 20 megapixels, fully decodes, applies orientation, strips metadata and normalizes to WebP with maximum dimensions of 2,000 pixels. Browser checks are only convenience; server validation is authoritative.

New direct dependency: **sharp@0.35.5** for image validation/normalization (Sharp was already present transitively through Next.js). No Cloudinary SDK is needed: `src/lib/cloudinary.ts` uses the documented [signed REST API](https://cloudinary.com/documentation/signatures), Node crypto SHA-256 and native fetch/FormData. Requests have a timeout. No client-supplied remote URL is fetched.

The server generates an unpredictable public ID under `dsmenu/{trustedRestaurantId}/products/`, `categories/` or `restaurant/`, with overwrite disabled. MongoDB reuses the existing `{ url, publicId }` fields: `Product.image`, `Category.image`, `Restaurant.logo` and `Restaurant.coverImage`. It never stores binary files. Delivery URLs use `f_auto,q_auto,c_limit,w_1600`; existing lazy image loading and responsive containers remain in place. Missing/broken images retain the established placeholders.

### Safe replacement and cleanup

The server uploads a new unique asset, then conditionally updates MongoDB only if the prior image ID is unchanged. Competing replacements cannot delete each other's selected asset. A stale update returns 409 and cleans its unused new asset. Only after a successful database change does cleanup remove the previous asset. Image removal first unsets the DB reference, then attempts cleanup. Asset IDs for cleanup come from trusted database state and must belong to the tenant namespace; legacy/external assets are not deleted.

Cloudinary deletion failure is logged without secrets and does not undo the correct database state. A provider timeout or uncertain database/network failure may leave an unreferenced asset: no durable cleanup worker is introduced in this MVP. In particular, a new asset is not deleted after an ambiguous DB write failure because the write might have committed. Review unused assets operationally if such errors recur; prioritize valid image references over aggressive deletion.

### Freshness and deployment

The public restaurant route is explicitly dynamic and reads current MongoDB data. Successful menu/settings/image mutations also target `revalidatePath('/r/{slug}')` and the dashboard layout. Dashboard JSON is private/no-store, and forms reload an authorized snapshot after saving. An already-open customer menu updates on reload; menu-edit realtime is intentionally not added. Checkout independently rejects unavailable, archived or inactive-category products even if a customer's cart is stale.

On Vercel, use Node.js runtime, install from the lockfile, configure all three Cloudinary variables for each intended environment, and redeploy. Use separate development/preview and production Cloudinary accounts/environments where possible. No unsigned upload preset is required. Keep default image delivery enabled and allow outbound HTTPS to `api.cloudinary.com` plus delivery from `res.cloudinary.com` in any custom CSP. The upload route allows up to 60 seconds; verify the deployment plan supports that duration. No schema or index migration is added in this phase. Existing MongoDB replica set/Atlas, authentication and realtime settings remain required for their respective features.

### Manual test

1. Log in, open Categories, add Salads with Arabic/Hebrew/English names and save. Set a sort order and optionally upload an image.
2. Open Products, add Caesar Salad, select Salads, enter `42.90`, enable Available and Featured, then save. The image control becomes available after this first save.
3. Upload a JPEG/PNG/WebP within the stated limits. Confirm preview and public menu image. Replace it, then test Remove image and the placeholder.
4. Open `/r/salt?table=7` in another browser, select the desired language, add the salad and submit. Confirm the order totals and live dashboard flow.
5. Mark the product unavailable, reload the menu and confirm Add is disabled (or hidden according to existing restaurant settings). Change its price and reload; the historical order must retain 42.90.
6. Deactivate Salads and confirm the category/products disappear without being deleted. Reactivate, archive/restore the product, and verify ordering.
7. Update restaurant description/color, logo and cover in Settings. Reload the customer page and verify each change. Test all three languages and phone/tablet layouts.

Automated checks use a disposable replica set, existing mocked Pusher transport and a new local Cloudinary transport. The real application signing/validation code runs; test transport verifies signatures, tenant public IDs, committed references before deletion, upload failures and replacement races. No production Cloudinary uploads occur. Browser checks cover the Salads/Caesar flow, uploads, availability, prices/history, settings/logo/cover and RTL inputs. The previous staff navigation test still verifies a deferred placeholder under Tables and now additionally verifies the implemented Products screen.

### Phase 7 files

Created:

- `src/lib/validators/menu-management.ts`, `src/types/menu-management.ts`
- `src/lib/image-validation.ts`, `src/lib/cloudinary.ts`
- `src/lib/services/menu-management.ts`, `src/lib/services/menu-images.ts`
- `src/app/api/dashboard/menu/route.ts`, `categories/route.ts`, `categories/[id]/route.ts`, `products/route.ts`, `products/[id]/route.ts`, `settings/route.ts`, `images/[kind]/[id]/route.ts`
- `src/app/dashboard/categories/page.tsx`, `products/page.tsx`, `settings/page.tsx`
- `src/components/dashboard/menu-fields.tsx`, `menu-editor.tsx`, `menu-management.tsx`, `image-upload.tsx`, `restaurant-settings.tsx`
- `tests/menu-management.test.ts`, `menu-http.ts`, `menu-browser.ts`, `cloudinary-transport.ts`, `cloudinary-preload.cjs`

Modified:

- `src/lib/env.ts`, `src/lib/services/restaurant.ts`, `src/types/menu.ts`
- `src/app/r/[slug]/page.tsx`, `src/components/menu/restaurant-header.tsx`, `src/components/menu/menu-browser.tsx`
- `src/i18n/messages/ar.json`, `he.json`, `en.json`
- `tests/integration.ts`, `tests/staff-browser.ts`
- `package.json`, `package-lock.json`, `.env.example`, `README.md`

Phase 7 changed no existing Mongoose schemas. Table lifecycle and QR management were subsequently implemented in Phase 8 below. Payments, employee permission differences, analytics, subscriptions, custom domains, POS and AI remain unimplemented.


## Phase 8: tables, visit closure and QR cards

`/dashboard/tables` lists the authenticated restaurant's tables in numeric order. Staff can add a number (1-9999), edit an optional label (100 characters), and activate/deactivate. Numbers are immutable after creation: existing printed codes keep their meaning. There is no hard delete. The existing restaurant/number unique index handles concurrent duplicate creation with a readable conflict.

Status is derived, not stored: inactive flag -> INACTIVE; active visit -> OCCUPIED; otherwise AVAILABLE. Cards show visit start time, active-order count and unresolved-service count. Data reloads every 30 seconds and on focus/online, with an explicit Refresh button. No second realtime transport is introduced.

### Safe lifecycle and concurrency

An ACTIVE visit blocks deactivation. Close Session requires the exact current session ID and fails while any NEW/PREPARING order (or legacy ACCEPTED order) or PENDING/ACKNOWLEDGED service call remains. The transaction sets CLOSED/closedAt only when those checks pass, preserving every historical record. Duplicate closes return 409; a stale session ID cannot close a newer visit.

An additive, internal `Table.lifecycleVersion` field provides a shared write lock between visit creation, deactivation and closure. Existing tables need no backfill: `$inc` creates the field when first used. Closing also writes the same TableSession that order/service creation writes. MongoDB transaction conflict retries therefore serialize these operations; no read-check-write gap can strand an active visit on an inactive table or close a visit around a newly committed request. Replica-set MongoDB is required. No new indexes are needed; keep running `npm run db:indexes` during deployment for the existing unique/partial constraints.

Old closed-visit credentials cannot submit orders/services. Opening the QR again shows CREATE when no active visit exists; the first customer must choose a code for the new visit. Joining an existing visit requires its current code. A QR is an entry point, not proof of physical presence.

### QR and printing

`/dashboard/qr-codes` displays active tables only. Each URL is derived using the existing `tableQrUrl(APP_URL, slug, tableNumber)` helper. Production requires APP_URL to be an HTTP(S) origin with no credentials/path/query/fragment; set it to the stable public domain, not a Vercel preview hostname if printing permanent cards. No URL is stored in MongoDB.

The authenticated `/api/dashboard/tables/[id]/qr` endpoint verifies tenant ownership and active state before generating a PNG (768px, four-module quiet zone, medium error correction). Download names are `<slug>-table-<number>-qr.png`. New dependencies: `qrcode@1.5.4` and development-only `@types/qrcode@1.5.6`. No PDF library or external QR service is used.

`/dashboard/qr-codes/print?table=<id>` renders one authenticated card. Without a table parameter it prints all active tables, one per A4 page. The card contains the restaurant/logo if available, table/label, localized scan instruction, large QR, URL and language hint. Print / Save as PDF opens the browser's print dialog; PDF download uses its native Save as PDF destination. Set scale to 100%, disable browser headers/footers, wait for images to load, and scan a test print. Copy Link requires HTTPS or localhost browser clipboard support; failures offer the visible URL for manual copying.

All operations derive restaurant ownership from verified staff auth; client tenant overrides are rejected by strict validators. QR/print requests for foreign or inactive tables return not-found behavior. The opaque session ID is only an expected-visit selector and never authorizes closure on its own. HTTP mutation routes require same-origin requests and bounded JSON.

### Phase 8 file map

Created:
- `src/lib/validators/tables.ts`, `src/types/tables.ts`, `src/lib/services/tables.ts`
- `src/app/api/dashboard/tables/route.ts`, `[id]/route.ts`, `[id]/close/route.ts`, `[id]/qr/route.ts`
- `src/app/dashboard/tables/page.tsx`, `src/app/dashboard/qr-codes/page.tsx`, `src/app/dashboard/qr-codes/print/page.tsx`, `print/print.css`
- `src/components/dashboard/tables-manager.tsx`, `qr-cards.tsx`, `print-button.tsx`
- `tests/tables.test.ts`, `tests/table-http.ts`, `tests/table-browser.ts`

Modified:
- `src/models/Table.ts`: additive lifecycle lock.
- `src/lib/services/customer-session.ts`: transaction-safe visit creation/join against table lifecycle changes.
- `src/lib/staff-http.ts`: explicit table conflict codes.
- `src/components/dashboard/restaurant-settings.tsx`: explicit localized field labels; fixes the existing description accessibility/browser-test failure.
- `src/lib/env.ts`: validate canonical APP_URL and require it in production at runtime.
- `src/i18n/messages/{ar,he,en}.json`: complete localized table/QR UI.
- `tests/integration.ts`: isolated canonical test origin and new suites.
- `tests/staff-browser.ts`: replace obsolete Tables placeholder assertion with actual page assertions.
- `package.json`, `package-lock.json`: QR dependencies.
- `.env.example`, `README.md`: lifecycle/URL requirements and usage.

### Manual Table 16 flow

1. Configure MongoDB replica set, APP_URL, staff auth, Pusher, and Cloudinary for existing upload features. Run indexes, seed and create a staff account; start the application.
2. Log in, open Tables, add 16 with label Window. Confirm Available.
3. Open QR Codes; copy the Table 16 URL, download its PNG, print its single card, then test bulk print. Scan using a phone that can reach APP_URL (localhost on a phone refers to that phone).
4. Open the link as a customer. Refresh Tables and confirm Occupied. Send an order and a waiter request.
5. Try Close Session: it must reject unfinished work. Finish/cancel the order in Live Orders and resolve the service request.
6. Close Session. Confirm Available and preserved order/service history. The old credential's direct mutation must fail. Reopening the QR can start a new visit.
7. Close that visit, deactivate Table 16, verify its public link rejects entry and it disappears from QR Codes. Reactivate to reuse the same printed card.
8. Switch Arabic/Hebrew/English and test tablet/mobile layouts.

No payments, split bills, permissions, subscriptions, POS, custom domains, floor-plan editor, analytics or AI were added. The subsequent Phase 9 scope is operational analytics, documented below; provider smoke tests and deployment readiness remain recommended follow-up work.

Dependency check (2026-10-04): `npm audit --omit=dev` reports zero production advisories. Full audit reports five high entries tracing to one `braces` stack-exhaustion advisory through the existing ESLint/fast-glob chain. No framework downgrade or forced audit fix was applied; review a compatible upstream lint-tooling update when available.


### Phase 8 verification (2026-10-04)

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, no warnings.
- `npm test`: PASS, 35 tests, zero failures/skips.
- `npm run build`: PASS, production App Router build.
- `npm run test:integration`: PASS, all Phase 1-8 HTTP/database suites.
- `npm run test:browser`: PASS, all existing customer/auth/order/service/menu flows plus Table 16 and single/bulk print checks.

Tests use a disposable MongoDB replica set and mocked provider network transports, never the configured production database or real Pusher/Cloudinary accounts. Browser tests generated a one-page Table 16 PDF and a bulk PDF with exactly one page per active table (17 in the fixture). Print/table screenshots were visually reviewed. Test artifacts live in ignored `test-artifacts/`; scan a physical test print before deployment. Real provider connectivity and physical printer output remain deployment smoke checks.


## Phase 9: operational analytics (no customer payments)

`/dashboard/analytics` is a protected server-rendered report with Today, Yesterday, Last 7 Days and Last 30 Days links. It includes summary cards, orders/day with values, orders/hour bars, top products, table activity, visit counts/duration, order timings and service-call metrics. Every chart has visible textual counts; tables have captions and headers. Arabic, Hebrew and English translations and RTL/LTR layouts are supported. Empty values and insufficient timing samples have separate localized states. A route-specific loading skeleton and safe retry boundary handle loading/failure.

The overview retains current operational metrics and adds today's non-cancelled order count and completed order value, plus an Analytics link. Analytics is a report snapshot, not a live feed: navigate to a date preset or reload for fresh data. The recent order-history UI is unchanged.

### Exact metric definitions

All reports select each collection by its own **createdAt** in the reporting period and use its **current status**. These are creation-date cohorts, not cash/accounting reports or counts by servedAt. An order created yesterday and served today contributes completed value to yesterday. A visit spanning midnight is counted on its start date, while its orders are counted on their own creation dates. Current-day records after the query's current UTC instant are excluded.

| Metric | Definition |
| --- | --- |
| Orders, day/hour order counts | Non-cancelled orders: NEW, ACCEPTED, PREPARING, READY and SERVED. |
| Completed Order Value | Sum of stored Order.subtotal for READY and legacy SERVED orders. CANCELLED and active orders contribute zero. |
| Average Completed Order | Completed Order Value divided by READY plus legacy SERVED order count, rounded once to the nearest integer agora. No completed orders -> Not enough data. |
| Completed / Cancelled | Separate current-status counts inside the selected creation-date cohort. |
| Tables with Orders | Distinct table IDs with non-cancelled orders in the period; not an occupancy estimate. |
| Top Products | Top 10 by sum of item quantities in READY and legacy SERVED orders, then itemTotal value, then product ID for ties. Stored itemTotal supplies value. Latest snapshot names within the period supply AR/HE/EN labels. No Product/Category lookup is used; archived/deleted products remain historical. |
| Table Activity | Up to 50 tables ranked by non-cancelled orders, then visits. Displays independent visit/order cohorts and served value. Table numbers use one tenant-scoped batch lookup; missing tables display a historical-table label. |
| Visits | TableSessions created in the period, split by current ACTIVE/CLOSED state. |
| Average Closed Visit Duration | createdAt -> closedAt, only valid CLOSED visits. |
| Start time | Order.createdAt -> preparingAt (legacy acceptedAt when present), excluding cancelled orders. |
| Preparation time | preparingAt -> readyAt, excluding cancelled orders. |
| Fulfillment time | createdAt -> readyAt for READY; createdAt -> servedAt for legacy SERVED. Each completed order counts once. |
| Service calls | All requests created in the period, split WAITER/BILL/HELP, including unresolved requests. |
| Service response / resolution | createdAt -> acknowledgedAt / resolvedAt. |

Timing averages ignore missing, reversed or future ending timestamps and show the valid sample count. Zero samples produce null/Not enough data, not a misleading zero. A recorded zero-duration pair is valid. Monetary sums remain integer agorot and use the existing formatMoney helper only at display time. Current Product prices never affect historical values.

**DSMenu does not process customer payments.** Completed Order Value is not Payments Received. A resolved BILL request only means staff handled the request; it does not establish whether the customer paid. No payment state, gateway, checkout or card storage was added.

### Timezone correctness

The Restaurant schema has no configurable timezone, so reporting consistently uses the existing `Asia/Jerusalem` convention. MongoDB timestamps remain UTC. `analytics-range.ts` computes half-open `[local-day start, next local-day start)` UTC boundaries using Intl calendar conversion; it does not assume every local day is 24 hours. Last 7/30 Days includes today. MongoDB `$dateToString` and `$hour` receive the same timezone. The UI formats calendar-date keys without using the browser's timezone. Unit tests cover both 23-hour spring and 25-hour autumn DST days, and HTTP tests cover exact midnight inclusion/exclusion. Browser tests use America/New_York to detect server/browser inconsistencies.

### Security and performance

The service calls requireStaffApi internally, derives restaurantId from verified staff auth, explicitly converts that trusted ID to ObjectId for aggregation, and starts every pipeline with a tenant/date match. Strict Zod validation permits only four preset values; arbitrary dates, duplicate query keys and client tenant overrides are rejected. The read API uses private/no-store responses. The report DTO excludes credentials, notes, customer information and raw Mongoose documents. No customer tracking or new public write endpoint was added.

Three database aggregations run independently for orders, visits and service calls. Facets compute related metrics without loading individual orders into Node or making per-product/per-table queries. One additional batch table-number lookup is limited to the displayed 50 rows. Presets cap the time range at 30 local days, top products at 10, and aggregate queries have a 10-second maximum. There is no shared tenant-unsafe cache, job queue, Redis or analytics warehouse. These limits suit the MVP; very large restaurants may later need pre-aggregated daily summaries.

New additive indexes on Order, TableSession and ServiceCall: `{ restaurantId: 1, createdAt: -1 }`. Existing order/service status-prefixed indexes are retained for operational queues, but cannot efficiently cover all-status date filtering in the same way. The existing generic `scripts/indexes.ts` already calls createIndexes for every model; it needs no code change. Run `npm run db:indexes` before production use. This adds indexes without dropping uniqueness constraints. No data migration, backfill or new collection is needed.

### Scope and dependencies

No new dependencies or environment variables were added. Bars use HTML/CSS alongside explicit numeric values. Category rankings are intentionally omitted because historical order items have no category snapshot. Menu views/QR scans are not tracked or inferred from visits: page views, unique visitors and QR scans are different measurements. Custom date ranges, CSV export, slow-order lists and extra order-history filters are optional follow-ups, not part of this implementation.

### Phase 9 file map

Created:
- `src/lib/analytics-range.ts`: validated presets, local calendar boundaries.
- `src/lib/analytics-pipelines.ts`: order/timing aggregation expressions.
- `src/lib/services/analytics.ts`: authenticated query orchestration and DTO mapping.
- `src/types/analytics.ts`: serializable report types.
- `src/app/api/dashboard/analytics/route.ts`: private read endpoint.
- `src/app/dashboard/analytics/page.tsx`, `loading.tsx`, `error.tsx`: route and safe states.
- `src/components/dashboard/analytics-report.tsx`: server-rendered localized report.
- `tests/analytics.test.ts`, `analytics-http.ts`, `analytics-browser.ts`: boundary, business/security and browser checks.

Modified:
- `src/models/Order.ts`, `TableSession.ts`, `ServiceCall.ts`: additive tenant/date indexes.
- `src/lib/dashboard-navigation.ts`: Analytics navigation item.
- `src/app/dashboard/page.tsx`: today's summary and report link.
- `src/i18n/messages/{ar,he,en}.json`: navigation and complete analytics translations.
- `tests/integration.ts`: runs analytics HTTP/browser suites after all previous phases.
- `README.md`: definitions, indexes, security and operating instructions.

### Manual verification

1. Run `npm run db:indexes` against the intended development database, start DSMenu and log in. Open Analytics.
2. Submit a customer order. Today counts it, while Completed Order Value stays unchanged until staff marks it READY. Cancel a separate order and check the separate cancellation count.
3. Change a product's live price or archive it; existing served-order values and top-product history must retain their snapshot values.
4. Compare Today, Yesterday, 7 Days and 30 Days. Check the displayed Jerusalem timezone. Near midnight, compare the local date rather than UTC date.
5. Move an order through preparation/ready, handle a service call, and close a safe visit. Check timing samples and visit/service counts after reloading. Resolving a bill request must never produce a payment confirmation.
6. Log in as another restaurant. Its report must contain only its own records; adding restaurantId to the analytics API query must fail.
7. Switch AR/HE/EN and check tablet/mobile layouts. Empty periods should show zero counts and Not enough data for averages.

Automated tests use a separate analytics fixture tenant inside the disposable seeded test database, with deterministic historical snapshots and another tenant's live orders. They never modify production data or real provider accounts.

The MVP feature set is frozen. Production operations and handover are documented in [the production runbook](docs/PRODUCTION.md); no further feature phase is planned here.


### Phase 9 verification (2026-10-05)

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, no warnings |
| `npm test` | PASS: 38 tests, zero failed/skipped |
| `npm run build` | PASS |
| `npm run test:integration` | PASS: all Phase 1-9 database/HTTP checks |
| `npm run test:browser` | PASS: all previous flows and new analytics UI checks |

English tablet and Arabic mobile report screenshots were visually reviewed. Test coverage includes exact midnight boundaries, both Jerusalem DST transitions, cancelled/active/served value definitions, rounded integer-agora averages, deleted/archived product history, invalid/missing/future timestamps, tenant overrides, notes/credential exclusion and preservation of unique indexes. Pusher/Cloudinary network transports remain mocked in tests; no production service was invoked. No new dependency or secret was introduced.


### Super Admin

Platform owners can create restaurants and their initial OWNER through `/admin`, then activate/deactivate restaurants without deleting history. Bootstrap the first platform account using `npm run create-super-admin`; see [setup, security and manual checks](docs/SUPER-ADMIN.md). Existing employee CLI tools remain available.


### Takeaway and grouped Products

Takeaway uses `/r/{slug}?mode=takeaway` with a separate secure visit and QR. Products now appear in category grids. **Run `npm run db:indexes` before enabling takeaway** to safely replace the legacy table-only uniqueness constraints. See [architecture, deployment and manual checks](docs/TAKEAWAY-AND-PRODUCT-GRID.md).

### Saved option groups

Products links to `/dashboard/option-templates`. Save existing product groups as templates or copy saved groups into new/existing products, with independent IDs and no live synchronization. The existing `npm run db:indexes` command creates the new collection's tenant/name index. See [workflow, security and file manifest](docs/OPTION-TEMPLATES.md).

### Table session bills

Tables → Close Session opens a snapshot-based bill before confirmation. Active orders and unresolved service calls block closure; cancelled orders are displayed but excluded from the total. No payment is processed or verified. See [workflow, safety rules and manual checks](docs/TABLE-SESSION-BILL.md).

## Kitchen thermal tickets

PREPARING orders/batches support optional kitchen tickets, shared Printed/Reprint counts, and AR/HE/EN 80mm/58mm layouts. Run `npm run db:indexes` before production use. See [printing workflow and printer setup](docs/KITCHEN-PRINTING.md). Browser print initiation is tracked; physical output is not confirmed.

## Table access codes

Table QR visits now require creating or entering a session-scoped three-digit code. Closing the visit invalidates it; the next visit chooses its own code. See [security, rollout and reset verification](docs/TABLE-ACCESS.md).

### Optional table access-code protection

Restaurant Settings / Table Security controls the default for new table visits. Each visit snapshots its mode, so toggling does not change active sessions. Both modes retain secure HttpOnly credentials. See [settings behavior, security and verification](docs/TABLE-ACCESS-SETTINGS.md).
