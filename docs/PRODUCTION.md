# Production launch runbook

The MVP feature set is frozen. This runbook prepares one real restaurant; it does not deploy accounts, DNS or production data automatically. Run all steps against an explicitly selected environment. Never run `seed`, integration tests or browser tests against a real restaurant database. Automated integration/browser tests create their own disposable replica set and mock only external provider transports.

## Configuration and deployment prerequisites

Required production environment names:

- `MONGODB_URI`: dedicated Atlas database, with transactions supported.
- `APP_URL`: canonical public origin, normally `https://dsmenu.com`.
- `AUTH_URL`: exactly the same origin as APP_URL.
- `AUTH_SECRET`: independently generated cryptographically random secret, at least 32 characters.
- `REALTIME_APP_ID`, `REALTIME_KEY`, `REALTIME_SECRET`, `REALTIME_CLUSTER`: one production Pusher Channels app.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: production Cloudinary environment.

`NEXTAUTH_URL` is a legacy fallback, not an additional requirement. Remove it when setting AUTH_URL rather than leaving conflicting origins. No NEXT_PUBLIC variables are required. Server secrets must never use that prefix. The Pusher key/cluster are intentionally public configuration delivered by the server; its secret never reaches the browser. Vercel sets NODE_ENV. `DSMENU_STAFF_PASSWORD` is temporary operator input only, never a Vercel setting.

Keep Preview and Development isolated from Production: different databases, auth secrets and provider credentials. Do not give untrusted preview builds production access. Keep `.env.local` ignored, and use a password manager for deployment/operator credentials. This working folder has no Git repository, so commit history could not be audited. Before first push, review staged files and ignore rules; do not upload environment files, test artifacts or `.local-mongo`. If any secret was previously published, rotate it regardless of later removal.

## MongoDB: exact safe sequence

1. Provision an Atlas replica set cluster and dedicated production database. Choose a region near the Vercel function region. Confirm the tier supports the backup policy you need; do not assume free tiers include managed backups.
2. Configure TLS, strong unique database credentials and network access. Use a narrowly scoped operator account able to create indexes and a database-scoped runtime account. Allow the operator's current IP temporarily. Configure supported Vercel egress/private connectivity for your hosting plan; do not casually open Atlas to the whole internet.
3. Enable scheduled backups with retention and an owner. Restore a backup into a separate database and verify collections, indexes and sample histories before launch. Never test restore over production.
4. In a trusted operator terminal, inject the production `MONGODB_URI` through your secret manager. Do not paste the URI into shell history. Existing process environment values take precedence over `.env.local`. Set `$env:NODE_ENV = 'production'`.
5. Run `npm ci`, then `npm run db:indexes`. Stop on any error. The script uses additive `createIndexes`, not `syncIndexes`; it does not drop indexes or data. Resolve any pre-existing duplicate data with a reviewed migration, never automatic deletion.
6. Verify the unique restaurant slug, user email, restaurant/table number, active table session, order idempotency/order number, and unresolved service-call constraints exist, along with tenant/date reporting indexes. `autoIndex` is deliberately disabled in production. Index creation is an operator step, never a request or build hook.
7. Run restaurant/user onboarding below. Remove temporary operator network access and credentials from the shell when done. Keep database credentials out of logs and screenshots.

## First restaurant and employee

The CLI is operator-only; no registration endpoint or default password exists. It inserts only, rejects duplicate slugs, requires the unique slug index and never overwrites a restaurant. Currently supported onboarding defaults are Arabic, all AR/HE/EN languages and ILS. Do not use the demo seed for production.

```powershell
# Production MONGODB_URI was injected securely in the previous step.
$env:NODE_ENV = 'production'
npm run db:indexes
if ($LASTEXITCODE -ne 0) { throw 'Index creation failed; stop onboarding.' }
npm run create-restaurant -- --name "Restaurant Name" --slug "restaurant-name"
if ($LASTEXITCODE -ne 0) { throw 'Restaurant creation failed; stop onboarding.' }

$staffPassword = Read-Host 'Unique owner password (12+ characters, maximum 72 UTF-8 bytes)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($staffPassword)
try {
  $env:DSMENU_STAFF_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  npm run create-user -- --restaurant restaurant-name --name "Owner Name" --email "owner@example.com" --role OWNER
  if ($LASTEXITCODE -ne 0) { throw 'User creation failed.' }
} finally {
  Remove-Item Env:DSMENU_STAFF_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  $staffPassword.Dispose()
}
```

Repeat create-user with a distinct email and `--role STAFF` if needed. Both roles have the same MVP permissions. Passwords are bcrypt-hashed; the CLI does not print passwords and refuses existing accounts. Hand over credentials using a password manager, not chat or screenshots. Environment variables still exist in process memory during execution, so use only a trusted operator machine.

After deployment, log in and configure in this order:

1. Restaurant settings: name, descriptions, contact details, links, branding and availability behavior.
2. Categories: AR/HE/EN names, active state and ordering.
3. Products: all translations, correct category, integer-agora prices, availability, featured state and ordering.
4. Images: upload real logo/cover/category/product images; check both upload and replacement.
5. Tables: create the real floor plan, confirm unique numbers, labels and active state.
6. QR management: download PNGs and print cards only after the canonical production domain is working. Scan every physical card to verify restaurant and table. Print at actual size and preserve the quiet border. Use the browser print/PDF flow for single and bulk cards.

The existing language UI defaults to Arabic and supports all three languages. Reporting uses Asia/Jerusalem; the MVP does not provide per-restaurant timezone configuration. Prices are integer agorot: 4800 = ₪48.00, 1990 = ₪19.90. Bill requests do not imply payment.

## Vercel: exact safe sequence

1. Review secrets/ignored artifacts before creating or connecting a private Git repository. Preserve the lockfile. Record the deployment commit/release identifier.
2. Import the project using the Next.js preset. Use Node **24.x** (also pinned in package.json), install with `npm ci`, build with `npm run build`. The production runtime must remain Node, not Edge, for Mongoose, bcrypt and image processing.
3. Select a function region near Atlas and configure database network access. Set all production environment variables above in Vercel's **Production** scope. Configure separate Preview resources or protect/disable previews. Never add seeds, user creation or index creation to the build command.
4. Configure Pusher Channels with the matching app/key/secret/cluster and TLS. Keep authorization on the existing private-channel endpoints; no public restaurant stream. Configure the Cloudinary product environment and signed server uploads; no unsigned preset is required. Verify delivery transformations are allowed under your account's settings.
5. Run `npm run check:production` in an operator environment containing the intended production variables. This validates configuration syntax, HTTPS origins and complete provider groups without printing values. It does **not** validate credentials, indexes, DNS or connectivity. Running it against the normal localhost `.env.local` correctly fails its HTTPS check.
6. Deploy, then add `dsmenu.com` in Vercel and apply the exact DNS records Vercel supplies. Choose one canonical domain; redirect alternatives such as www to it, preserving paths and query strings. Wait for valid HTTPS before issuing QR cards. Set APP_URL and AUTH_URL to that canonical origin and redeploy after environment changes.
7. Configure an edge/WAF login rate limit for POST `/api/auth/callback/credentials`. The built-in login limiter is process-local and is not a distributed serverless limit. A starting policy is 20 attempts per IP per 5 minutes, monitored and adjusted for shared restaurant Wi-Fi. Protect mutation routes against abuse without limiting ordinary GET polling or legitimate shared-IP ordering. Validate the rule with your Vercel plan before opening public access.
8. Run the live smoke test below. Inspect function logs, provider dashboards and browser errors without logging cookies, raw tokens, passwords, request bodies or database URIs. Do not hand out QR cards until it passes.

The upload route declares a 60-second maximum duration and accepts at most 4,000,000 raw bytes, below Vercel's documented 4.5 MB request limit. Confirm the selected hosting configuration honors the duration. Files are decoded/validated and transformed in memory with sharp, then persisted in Cloudinary; there is no durable local-filesystem requirement. Cloudinary URLs handle image optimization, so current unoptimized Next Image usage does not require a remote image optimizer allowlist.

## Security and recovery behavior

- Every staff operation derives restaurant ownership from the validated authenticated session, never a client restaurant ID. Active user/restaurant and auth-version checks remain in place. Customer access is scoped to the restaurant/table and a hashed secure session credential.
- Staff and customer cookies are HttpOnly, Secure in production and SameSite=Lax. Customer cookies additionally have a restaurant/table API path. Moving from localhost or between domains does not transfer cookies or local storage: staff logs in again and customers rescan the canonical QR. Never disable Secure or copy tokens to solve domain changes.
- A QR URL identifies a table, not physical presence. Anyone with its URL can attempt to join the table visit. Restaurant operating procedures and abuse monitoring remain necessary.
- Private Pusher authorization verifies the staff restaurant or the customer's secure active visit. Events contain invalidation metadata, not credentials or full orders. MongoDB commits precede publishing; provider failure cannot undo a successful order/status change. Reconnect, focus and periodic refresh reconcile from MongoDB. A process failure after commit can lose a notification; reconciliation recovers the data.
- Sound requires a browser interaction, persists its preference and deduplicates known order/call IDs. Keep the tablet awake and browser foregrounded; operating systems may suspend background pages.
- Uploads enforce actual JPEG/PNG/WebP decoding, byte/pixel limits, tenant-owned asset IDs and authenticated access. Replacement writes the new image reference before cleaning up the old one. Failed cleanup may leave an orphan rather than destroy a valid image. Review provider orphans manually; never bulk-delete solely by age.
- Product/menu changes are visible on reloading the menu; there is no live catalog stream. Server submission always checks current availability and pricing. Historical orders retain their snapshots.
- Closing a visit requires all active orders and unresolved service calls to be handled. Orders/history are not deleted. If a visit cannot close, resolve the reported work rather than editing MongoDB manually.

MongoDB backup is not an image backup. Enable an appropriate Cloudinary backup/retention policy or retain original restaurant assets separately. A restored database can reference an image deleted after that snapshot; test image recovery alongside database recovery. Store configuration recovery instructions in a password manager, not the source repository.

For an incident: pause new restaurant activity operationally, record time/deployment, preserve logs without secrets, and identify whether the failure is app, database or provider. Roll back to a known Vercel deployment for a code regression; this does not roll back data. Restore MongoDB only into an isolated database first, reconcile missing/repeated orders with staff, then explicitly plan cutover. Review restored ACTIVE visits and outstanding calls/orders before reopening; backups can restore old credentials and stale visit state. Rotate AUTH_SECRET if session revocation is required, and close/reconcile affected customer visits. Do not blindly restore over the live database or retry orders with new identifiers after an ambiguous timeout.

Assign monitoring owners for Vercel errors/latency, Atlas connections/storage/backups, Pusher connection/event quotas, Cloudinary errors/storage and billing. Test backup restoration periodically and record recovery time. Keep a restaurant fallback procedure for taking orders when connectivity fails.

## One-phone / one-tablet live smoke test

1. Tablet: log in over the production HTTPS origin. Open Live Orders, enable sound through a tap, and verify an empty queue or only this restaurant's data.
2. Phone: scan the physical Table 7 card. Confirm the correct restaurant/table with no table-selection prompt. Also open the menu without a table parameter and verify manual selection.
3. Switch Arabic → Hebrew → English; verify directions, names, prices, touch targets, readable notes and no horizontal overflow. Reload and confirm the language selection persists.
4. Add items with quantities and notes, edit the cart, then submit once. Confirm a single order appears on both devices and one sound plays. Refresh the phone; the same visit and history remain.
5. Tablet: move NEW → PREPARING → READY. Confirm phone statuses update automatically, the order leaves the active queue and remains in history. Submit another phone order; it must be a separate order in the same visit.
6. Phone: request waiter, bill and help. Verify labeled table alerts, cooldown/duplicate prevention and one sound per genuinely new call. Acknowledge and resolve each on the tablet. No payment confirmation should appear.
7. Disconnect/reconnect the tablet network, then phone network. Known data stays usable, errors are understandable and refreshed state catches up. Verify sound OFF stays off and reconnect does not replay known alerts.
8. Update a product price/availability and replace an image from the tablet. Reload the phone menu; verify changes and unavailable-product rejection. Previous orders retain their original names/prices. Check Cloudinary upload/replacement with real credentials.
9. Try closing a visit with outstanding work; it must refuse. Finish/cancel the remaining orders, resolve calls and close. Confirm the table is available and a new scan obtains a new visit. Deactivate a spare table and confirm it cannot start a visit.
10. Check analytics totals/date controls against completed test orders. Print a single card and bulk cards; scan both. Verify logout/login and repeat key controls in Arabic RTL at phone/tablet widths.

Before handover, use a second test restaurant/account to confirm direct dashboard/API access cannot retrieve the first restaurant's data; automated tests already cover this, but deployment configuration must not bypass app authentication.

## Go-live checklist

- [ ] All six required local checks pass on this release.
- [ ] Source/staged files reviewed for secrets; leaked credentials rotated if applicable.
- [ ] Production Atlas database, network policy, indexes and tested backups are ready.
- [ ] Production/Preview credentials are separated; HTTPS canonical origins agree.
- [ ] Pusher private authorization and Cloudinary signed uploads pass live tests.
- [ ] Edge login rate limiting, monitoring and incident ownership are configured.
- [ ] Unique owner account, real translations/menu/prices/images and tables are verified.
- [ ] Phone/tablet smoke test, sound, reconnection, RTL and history pass.
- [ ] Printed QR cards point to the canonical production URL and correct tables.
- [ ] Restaurant staff understands closing visits, bill requests and offline fallback.

## Review scope and dependency note

### Verification on 2026-10-05

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 40 tests, none skipped |
| `npm run build` | PASS |
| `npm run test:integration` | PASS, including actual operator CLI subprocesses |
| `npm run test:browser` | PASS: all Phase 1–9 workflows |
| `npm audit --omit=dev --json` | PASS: zero reported production vulnerabilities |
| Client bundle secret-value scan | 29 bundles checked, no configured secret matches |

Mobile Arabic menu/report and tablet order screenshots were visually inspected. Full npm audit still reports the development-tooling advisory below. The production preflight correctly rejects the local HTTP origin; its valid-production and rejection paths pass unit tests. Production DNS, credentials, network access, backups and provider delivery remain manual launch gates, not claims made by these local checks.

Reviewed tenant scoping, auth/cookies, order/session concurrency and idempotency, service-call cooldowns, menu/image ownership, table lifecycle, QR URLs, reporting bounds, environment loading and Vercel runtime compatibility. Current configured secret values were scanned against source and client bundles without printing them. No production data or external configuration was changed. Automated provider mocks do not prove live Pusher/Cloudinary credentials or delivery.

The npm audit reports five high-severity development dependency entries in one ESLint → fast-glob → micromatch → braces chain (GHSA-vfj7-8cjw-p6xm). The suggested automated fix downgrades eslint-config-next to Next 14 tooling; it was not applied to this Next 16 project. These dependencies are build/lint tooling, not request handlers. Do not feed untrusted glob patterns into build tooling; track an upstream compatible fix and rerun audit before future upgrades. No dependency was added by this readiness pass.

Primary deployment references: [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [function limits](https://vercel.com/docs/functions/limitations), [domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [Atlas cloud backups](https://www.mongodb.com/docs/atlas/backup/cloud-backup/overview/), [Pusher authorization](https://pusher.com/docs/channels/server_api/authorizing-users/).
