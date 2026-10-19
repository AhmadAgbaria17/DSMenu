# Table session bill and reviewed closure

On `/dashboard/tables`, **Close Session** opens a bill drawer; it no longer offers confirmation without a summary. While food orders or service calls are unfinished, the drawer shows **Current Bill**, explains the blockers and disables closure. Once safe, it shows **Final Bill** and staff can confirm **Close Session**. The drawer supports Arabic, Hebrew and English and inherits RTL/LTR.

## Amounts and history

The summary reads only Orders scoped to the authenticated restaurant, table and exact TableSession. It displays every order separately, with translated product names, quantity, stored unit/item prices, customization selections and their price additions, removed ingredients, item/order notes, creation time and subtotal. Restaurant, table and visit opening time appear above the orders.

NEW, ACCEPTED, PREPARING, READY and SERVED subtotals contribute to the total. CANCELLED orders remain visible with an explicit excluded-subtotal label and do not contribute to the total or included-order count. Addition uses integer agorot and the existing money formatter. No Product lookup or repricing occurs. Empty visits total zero. Invalid/mixed-currency stored amounts fail closed rather than producing an unreliable bill.

No duplicate bill total is stored. Closed visits can be reconstructed through the same tenant-scoped bill service using their exact session ID, even after a new visit starts at the same table. Orders, ServiceCalls and their snapshots are preserved.

## Security and concurrency

`GET /api/dashboard/tables/[id]/bill?sessionId=...` authenticates staff and scopes all reads to their restaurant, table and session. Its DTO is serialized and private/no-store. A MongoDB snapshot transaction gives a consistent view of orders and service calls. It includes no session credentials.

The existing close transaction still writes the table lifecycle and ACTIVE session, so concurrent customer order/service creation conflicts and retries safely. Before commit it reconstructs the authoritative bill and refuses closure for NEW/ACCEPTED/PREPARING/READY orders or PENDING/ACKNOWLEDGED calls. Rejection rolls back the temporary CLOSED write. Success sets CLOSED and closedAt and preserves all history. The existing table status becomes AVAILABLE; old customer credentials cannot create orders or calls.

The drawer submits sessionId and a server-generated SHA-256 bill revision, never a total. The revision covers the exact order snapshots and unresolved-call count. If it changed since review, confirmation returns a conflict, the drawer reloads, and staff must review again. `billRevision` remains optional for backward-compatible existing close callers; every caller still receives the server-side total calculation and all closure safety checks. Unrecognized payload fields such as finalTotal are rejected.

The drawer refreshes on focus/online, every 30 seconds and through **Refresh bill**. Loading/failure prevents confirmation. Successful closure refreshes the table list immediately. No new realtime transport is introduced.

## Meaning of closure

Closure means only that the restaurant has finished handling this table. DSMenu does not process or verify payment, store a payment method or mark the customer paid. No payment, invoice, receipt, accounting or printing system was added.

## Files

New: `src/types/table-bill.ts`, `src/lib/table-bill.ts`, `src/lib/services/table-bill.ts`, `src/app/api/dashboard/tables/[id]/bill/route.ts`, `src/components/dashboard/table-bill.tsx`, `tests/table-bill.test.ts`, `tests/table-bill-http.ts`, `tests/table-bill-browser.ts`, this guide.

Modified: `src/lib/services/tables.ts`, `src/lib/validators/tables.ts`, `src/components/dashboard/tables-manager.tsx`, AR/HE/EN dictionaries, `tests/table-browser.ts`, `tests/integration.ts`, README. Existing option-template work is preserved.

## Manual check

1. Log in as Salt staff and open Table 7 in a separate customer browser.
2. Send two burgers and fries. Open Tables → Close Session: the running bill appears, but closing is disabled.
3. Process that order through SERVED. Send coffee as a second order and serve it.
4. Open Close Session again. Verify both orders, options, notes, subtotals and total. With burgers at ₪48, fries at ₪18 and coffee at ₪12, the total is ₪126.
5. Change the current product price: the historical bill must remain unchanged. Cancelled orders, if any, must be labelled and excluded.
6. Confirm closure after the restaurant has finished handling the table. Verify Available state, preserved order history and rejection of an order using the old credential.
7. Repeat with an unresolved service request: resolve it before confirmation becomes available. Check all three languages.

No dependencies, environment variables, indexes or database migrations are needed for this feature. Automated tests use disposable data and mocked external transports; the live database is not modified.

## Verification results — October 19, 2026

- `npm run typecheck`: PASS.
- `npm run lint`: PASS after correcting the initial fetch effect and abort cleanup.
- `npm test`: 58 passed, zero failed/skipped.
- `npm run build`: PASS, repeated after the effect correction.
- `npm run test:integration`: PASS, including snapshot bills, tenant/session isolation, all order/service blockers, stale-review conflicts and historical preservation.
- `npm run test:browser`: PASS; the complete suite was repeated against the final build. The new Table 7 scenario verifies two burgers/fries followed by coffee, ₪126.00, options/notes, disabled premature closure, AR/HE/EN, table availability and rejection of the old credential.

Bill screenshots in all three languages and the English total/confirmation area were visually reviewed. Existing tests were retained; the old table browser test now asserts the disabled close button and ACTIVE session while blocked, then reviews the zero-total cancelled-order bill before closing.
