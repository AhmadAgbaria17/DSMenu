# Empty table session cleanup

An ACTIVE table visit is eligible after **120 full minutes** since the later of
`createdAt` and `lastActivityAt`. Legacy visits without lastActivityAt use
createdAt. Time comes from the server. The single policy constant lives in
`src/lib/empty-table-sessions.ts`. Browsing and refresh do not extend the visit;
existing order/service creation writes are the meaningful activity timestamps.

Eligibility also requires **zero Orders of any status**, no PENDING or
ACKNOWLEDGED ServiceCalls, and no positive order allocation counter. READY,
SERVED and CANCELLED orders all protect their visit. Resolved calls do not block
closure once the activity threshold passes. Takeaway visits are never queried.

## Triggers and deployment

- Normal table QR session establishment checks that specific restaurant/table
  before reusing an old credential or joining a visit. A timed-out visit closes
  and the normal entry flow can create a fresh visit with a new credential.
- Staff table reads check only the authenticated restaurant. The existing table
  screen refreshes every 30 seconds and on focus/online, so availability updates
  without a new realtime system.
- For cleanup while **nobody is accessing the app**, configure a server scheduler
  to GET `/api/cron/empty-table-sessions`, with
  `Authorization: Bearer <CRON_SECRET>`. Set CRON_SECRET to a random server-only
  secret of at least 32 characters; never prefix it with NEXT_PUBLIC_. The route
  fails closed when unconfigured and accepts no query parameters or client tenant
  IDs. Its response contains counts only and is not cached.

The endpoint runs in the Next.js Node runtime and needs no long-lived process.
No scheduler is automatically provisioned by this repository. Configure your
hosting provider's scheduler or an external authenticated scheduler (for example,
every five minutes), subject to that provider's scheduling/runtime limits. Until
then, lazy cleanup still works on entry and staff table reads, but idle visits
are not processed at an exact wall-clock deadline. With scheduling, closure occurs
on the next successful run after the threshold, never before it.

Each invocation processes at most 25 eligible visits. If the response reaches
`batchLimit`, schedule another invocation; repeated/concurrent calls are safe.
Failures return 503, and the scheduler should retry. Already committed closures
remain valid if a later candidate fails.

Run `npm run db:indexes` against the intended database during deployment to add
the cleanup candidate and child-existence indexes. Production auto-indexing stays
disabled. No historical data backfill or deletion is needed.

## Safety and data

The checkout uses a shared MongoDB database. The scheduled job discovers tenant
IDs from stored sessions; each transaction is scoped by restaurant, table and
session. Lazy callers derive their scope from staff authentication or the server's
validated slug/table lookup. No control database or tenant-routing change is made.

Indexed aggregation probes exclude visits with orders/unresolved calls before
the batch limit. Each candidate is checked again inside a snapshot transaction.
The conditional session write conflicts with order/service creation, which already
write the same session document. Transaction retries recheck current eligibility.
If a blocker exists, the tentative close is rolled back. This avoids the unsafe
pattern of checking children then closing in an unrelated write.

The visit is retained with status CLOSED, closedAt and
closeReason AUTO_EMPTY_TIMEOUT. The existing active-visit table-state calculation
makes an active table AVAILABLE. Old credentials remain attached to the historical
visit but its CLOSED status rejects orders, service calls and related mutations;
they cannot authorize a later visit. New manual closures record MANUAL while all
existing bill/revision/order/service guards remain unchanged. Legacy closed visits
may have no reason, which is intentionally left untouched.

Orders, bills, calls and takeaway sessions are not mutated or deleted. Order
revenue/count analytics remain unchanged; session analytics may retain the
historical zero-order visit as before. There are no fabricated payments or orders.

## Tests and changed files

`tests/empty-table-sessions.test.ts` covers policy boundaries and indexes.
`tests/empty-table-sessions-http.ts` covers recent/old activity, legacy timestamps,
all order statuses, unresolved/resolved calls, tenant scoping, scheduler auth,
credential rejection/new QR entry, idempotency and concurrent order/service races.
It runs through `tests/integration.ts`, including the full browser test command.
Existing manual-close, Final Bill and customer/browser suites remain intact.

Implementation files: `src/lib/empty-table-sessions.ts`,
`src/lib/services/empty-table-sessions.ts`,
`src/app/api/cron/empty-table-sessions/route.ts`,
`src/lib/services/customer-session.ts`, `src/lib/services/tables.ts`,
`src/models/TableSession.ts`, `src/models/Order.ts`, `src/models/ServiceCall.ts`,
and `.env.example`. No new package dependencies are required.

Verification on 2026-10-25: `npm run typecheck`, `npm run lint`, `npm test`
(70 passed), `npm run build`, `npm run test:integration`, and
`npm run test:browser` passed. The first browser run hit a transient duplicate
streamed QR-card locator in the existing table-print test; the unchanged full
rerun passed. No test assertions were removed or weakened. No production database
cleanup or scheduler deployment was performed by this implementation task.
