# Takeaway ordering and grouped products

## Deployment: apply indexes first

Run `npm run db:indexes` against the intended database before enabling this release. MongoDB must be a replica set/Atlas, as already required by table ordering. No new dependency, provider or environment variable is required.

The command builds partial unique indexes for table order numbers/idempotency and separate takeaway equivalents. It then drops ONLY the two known legacy non-partial table constraints, after replacement constraints exist. Those old indexes treated missing tableSessionId as null and would otherwise collide across independent takeaway visits. The migration is rerunnable, retains all documents and unrelated indexes, and preserves table uniqueness throughout. Takeaway establishment/submission fails closed while legacy constraints remain or required takeaway indexes are absent. This migration was tested using a disposable database containing existing table history; it was not applied to the user's live database.

No historical fulfillment backfill is needed: orders without fulfillmentType are displayed as TABLE. Do not roll back to an older application that assumes every order has a table after accepting takeaway orders.

## Takeaway architecture

Each restaurant has `/r/{slug}?mode=takeaway`; existing `?table=7` links are unchanged. Mixed/invalid mode parameters are rejected. QR Codes has a separate takeaway preview, copy link, PNG download and printable card. URLs come from the authenticated restaurant and configured APP_URL origin.

A takeaway visitor first supplies a trimmed name (2-100 characters) and phone. Phone input accepts local/international digits, spaces, parentheses, dots and hyphens, normalizing to 7-15 digits with an optional leading +. No account, email or phone verification is required.

`TakeawaySession` is independent of TableSession: restaurantId, name/phone, status, expiry, sequence counter and a SHA-256 credential hash. It has no table ID. A cryptographically random 256-bit credential is sent only in an HttpOnly, SameSite=Lax cookie, Secure in production, scoped to that restaurant's takeaway API path. Authorization requires its hash, restaurant and unexpired ACTIVE visit. The URL, visit ID and name/phone do not authorize anything.

Sessions expire after 12 hours. Refreshes read/reuse the same valid visit without asking for identification again. Completed orders remain readable and additional orders can be placed until the credential expires. Expiry asks for identification again on refresh. There is no TTL deletion of visits or historical orders. Names are not unique identities. A bounded per-process entry throttle complements deployment-level trusted-proxy rate limiting; it is not a distributed limiter.

The same MenuBrowser, horizontal rows, search, Product Options and My Order components serve both modes. Cart and pending-submission storage use restaurant + takeaway visit ID, separate from legacy table storage. No credential or customer identity is stored in localStorage. Takeaway submissions also bind the expected visit ID to the authenticated credential, rejecting an old tab if another tab has started a different visit. Table service buttons are hidden and no takeaway service-call endpoint exists.

Shared `order-pricing.ts` reloads tenant-scoped available products and categories inside the transaction, validates options and calculates integer-agorot amounts. Each submission creates a distinct order. Transactional counters, fingerprints, scoped idempotency indexes and existing retry logic preserve duplicate safety. Takeaway Order stores fulfillmentType=TAKEAWAY, takeawaySessionId and authoritative name/phone snapshots; table references are absent. Legacy/table orders remain TABLE.

## Staff, realtime and analytics

Live Orders groups by the appropriate visit. Takeaway cards prominently identify Take Away, name and phone; table cards retain table numbers. Only authorized tenant staff DTOs include customer name/phone. Customer history contains order items/status but omits identity fields. Historical orders retain snapshots after catalog/visit changes.

The existing Pusher provider publishes only `{version:1}` invalidations after successful commits to the restaurant channel and a private takeaway-session channel. Customer authorization derives that exact channel from the cookie credential; staff still authenticate their restaurant channel. No names, phones or tokens enter events. Existing sound deduplication, reconnect, polling and manual-refresh behavior is reused.

Statuses now follow NEW -> PREPARING -> READY. NEW can be cancelled. READY reads "Your order is ready for pickup" and leaves the active queue. Legacy SERVED remains readable as "Picked up" without a staff pickup button. READY does not close the 12-hour visit. There is no delivery tracking or online payment.

Takeaway orders contribute to existing order totals, completed value, products and timing analytics. Table-specific aggregates explicitly exclude records without table IDs; takeaway does not invent a table or inflate table counts. No analytics redesign was added.

## Products dashboard

`/dashboard/products` uses the existing tenant-scoped category/product fetch, grouped in memory without per-category database queries. Categories and products sort by sortOrder, then ID. Category chips filter the sections. Search matches the localized product name and keeps category grouping. Archived/current filtering remains available. Missing/foreign category references appear under Uncategorized with a repair prompt; creation/edit still requires a valid same-tenant category.

The grid is one column below 600px, two from 600px and three from 1280px. It inherits RTL/LTR. Cards retain images, names, prices, quick availability, featured toggle and archive/restore, plus an option-group count. The authoritative Edit/Create form and Cloudinary upload are unchanged. Existing numeric sort controls remain; their ordering is displayed within each category. No drag/drop or carousel library was added.

## Manual checks

1. Apply indexes, log in as Salt staff, open QR Codes, and copy/print the separate Takeaway QR.
2. Open `/r/salt?mode=takeaway` in a separate customer browser. Enter Ahmad and 0501234567. Confirm the menu appears, refresh retains the visit, and service buttons are absent.
3. Configure a burger with free ingredients and paid Cheese through Products if needed. Remove Tomato, add Cheese, select sauce, and submit. Staff should immediately see Take Away, Ahmad, phone, item selections and the authoritative total.
4. Start preparing, then mark ready. Customer status should update without refresh. The ready order leaves the urgent queue and remains in history. Repeat with two visitors sharing the same name.
5. Check `/r/salt?table=7` still detects Table 7 and keeps a separate cart/session.
6. Open Products. Verify category grouping, category-local order, search and side-by-side cards. Toggle Cola unavailable and check the public menu. Edit a burger and verify options and image upload remain available.
7. Repeat in AR/HE/EN and at mobile/tablet/desktop widths.

## Files

New: `src/models/TakeawaySession.ts`; `src/lib/validators/takeaway.ts`; `src/lib/{order-indexes,takeaway-http,takeaway-throttle,managed-product-groups}.ts`; `src/lib/services/{takeaway-session,takeaway-orders,takeaway-qr,order-pricing}.ts`; `src/app/api/r/[slug]/takeaway/{session,orders,realtime}/route.ts`; `src/app/api/dashboard/takeaway/qr/route.ts`; `src/app/dashboard/qr-codes/takeaway/page.tsx`; `src/components/menu/takeaway-entry.tsx`; `tests/{takeaway.test,takeaway-http,takeaway-browser}.ts`; this guide.

Modified: Order model/model exports; order/live DTO types; customer order service and DTO; realtime publishing/channels; staff orders and table services; analytics pipelines; QR/customer paths; cart scope/provider and pending submission integration; public restaurant route/menu browser; My Order/customer status displays; staff Live Orders/cards; Products management; QR page/cards; AR/HE/EN dictionaries; index CLI; integration runner and mocked realtime transport; README.

No delivery, scheduled pickup, payments, SMS, OTP, customer accounts, profiling or loyalty features were added.
