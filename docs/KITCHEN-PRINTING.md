# Kitchen thermal tickets

Kitchen printing is optional preparation assistance, not a payment receipt,
customer receipt, invoice, fiscal document or POS integration. It never changes
order status, money, snapshots, order timestamps, bill totals or analytics.

## Staff workflow

Restaurant Settings → Kitchen Settings contains **Enable kitchen ticket printing**.
The restaurant's `kitchenPrintingEnabled` boolean defaults to true, including
legacy documents without the field. Both OWNER and STAFF use the existing settings
permissions. Disabling hides all operational Print/Reprint/count indicators on
grouped, standalone and takeaway orders; Start Preparing and Mark Ready remain
independent. Live Orders picks up the setting through its existing refresh,
focus/revalidation or page revisit behavior.

The protected ticket service checks the authenticated restaurant setting before
loading ticket data. Disabled API GET/POST requests return 403 with
`KITCHEN_PRINTING_DISABLED`; the preview page renders a localized disabled message
instead of a ticket. An already-open preview also handles a rejected print attempt.
Print recording checks the setting again transactionally using a technical
restaurant version write, serializing against concurrent settings changes.
No print history is deleted or reset; re-enabling restores the saved indicators.
No field migration, new environment variable, dependency or index is required for
this switch. Older settings clients omitting the field preserve the stored value.

1. Open Live Orders and start preparation.
2. A **Print Kitchen Ticket** action appears next to **Mark Ready** only for an
   actual `PREPARING` unit. A grouped batch has one action for the whole batch.
3. Open the protected preview, select **80 mm** or **58 mm**, then choose Print.
   Opening/reloading the preview alone does not record a print or trigger a dialog.
4. Select the installed thermal printer in the browser print dialog.
5. Return to Live Orders. The group shows **Printed**, then **Printed ×2** after
   an intentional reprint. Reprint remains available while PREPARING.
6. Mark Ready independently. Printing is never required and never marks Ready.

The ticket shows the restaurant name, large table number or TAKE AWAY label,
takeaway customer name, preparation start time (original order time for legacy
records without that timestamp, in Asia/Jerusalem), original order
numbers, individual item quantities/names, selected options, removed ingredients,
and prominent item/order notes. All names/options come from immutable Order
snapshots, not current products. It prints the current staff display language.
Phone numbers, prices, IDs, credentials and payment information are omitted.
Items remain separated by original order so distinct customizations cannot merge.

## Group identity and security

The URL is `/print/kitchen/batch/{preparationBatchId}` or
`/print/kitchen/order/{orderId}` for standalone orders, including takeaway and
legacy unbatched preparation. Every request requires authenticated restaurant
staff; all queries derive `restaurantId` from Auth.js and keep ownership filters.
A member of a batch cannot be printed through the individual-order path.
Batch membership is the stable preparationBatchId, never all orders at a table.
Later NEW orders and other batches are excluded. A batch with inconsistent
membership/status fails closed instead of printing a partial ticket.

This checkout uses the existing shared database with tenant-scoped models. The
feature preserves that architecture; it does not introduce a control database or
change connection routing. KitchenPrintState is restaurant operational data.

## Print state and concurrency

`KitchenPrintState` contains one record per
`restaurantId + unitType + unitId`, enforced by `kitchen_print_unit` unique index:

- `kitchenPrintCount`
- `kitchenPrintedAt` (most recent initiated flow)
- `lastKitchenPrintedBy` (staff ID, never exposed to customers)
- `lastRequestId` (internal retry guard, excluded from ordinary model reads)

Print state is not duplicated on each Order. The staff DTO resolves the same
metadata for every member of a batch. Customer order DTOs remain unchanged.
There is no automatic metadata/history deletion.

The print API accepts a UUID and expected count. It validates PREPARING and
increments metadata in a transaction, using a technical Order version write to
serialize against Ready without changing `updatedAt`. Same-attempt retries do not
increment twice; competing attempts with stale counts receive 409 and must review
the refreshed count. Failure to save metadata does not open the print dialog.

**Printed means browser print flow initiated, not physical paper confirmed.**
Metadata commits immediately before `window.print()`. Cancellation, printer
disconnection, blocked dialogs or hardware errors cannot reliably be observed by
normal browser JavaScript. Browser menu/Ctrl+P printing outside the application
action is not tracked. No silent printer selection or hardware confirmation is
claimed. A local bridge/kiosk/OS service would be a separate future feature.

Same-browser Live Orders receives a tenant-scoped BroadcastChannel invalidation.
Existing focus/reconnect/30-second revalidation also updates print state,
including other devices. No customer realtime event or new sound is emitted.

## Deployment

No dependencies or environment variables are added. Before using printing in
production, run the existing additive index command:

```text
npm run db:indexes
```

It initializes the new unique print-state index alongside existing indexes.
Production automatic indexing remains disabled. The print action fails safely
if that index is missing. No old Order data migration is needed.

## Thermal CSS and real-printer checklist

The standalone print route excludes dashboard navigation and sidebar. Its CSS
uses black text, white paper, system fonts with browser Arabic/Hebrew shaping,
12pt body / larger quantities and headings, strong note borders, simple vertical
sections and no images. Bidi isolation keeps quantities and order/table numbers
readable. The print controls are hidden under `@media print`.

The named `@page dsmenu-kitchen { size: auto; margin: 3mm }` respects the
browser/driver paper selection and keeps thermal page settings separate from QR cards.
CSS does not use the unsupported `80mm auto` paper-size combination. Content is
74mm for 80mm paper and 52mm for 58mm paper, with `max-width: 100%` for narrower
printable areas. Receipt length/page breaks are controlled by the printer driver;
CSS does not command the cutter or guarantee a continuous roll on every driver.

To test a physical printer:

1. Connect the printer to the staff computer/tablet and install its OS-supported
   driver. Confirm the browser/OS can see it; mobile printing support varies.
2. Create a two-order preparation batch with removed ingredients, extras, a sauce,
   a long note and multiple quantities. Print both Arabic/Hebrew and English.
3. Open Print Kitchen Ticket and choose the matching width in DSMenu.
4. Select the thermal printer and matching 80mm or 58mm roll in its properties.
5. Disable browser headers/footers and background graphics. Start at 100% scale
   and 3mm/minimal supported margins; use the driver's printable-area settings
   if its hardware margins require more space. Confirm the preview is not clipped.
6. Print and inspect top/bottom/sides, RTL shaping, numbers, options, notes and
   long-ticket page breaks/cutting. Adjust the OS driver, not product data.
7. Cancel once and confirm that the application still labels the initiated flow
   Printed. Use Reprint intentionally and verify the count increases.
8. Verify a later NEW order is absent from the old ticket and can prepare/print
   separately. Verify Mark Ready also works without any print.

Automated browser tests stub only `window.print()` because CI cannot operate a
physical printer. They exercise the actual protected route/API and generate
AR/HE/EN 80mm/58mm PDF/screenshot artifacts in `test-artifacts/`. Physical paper
output still requires the checklist above.

## Resume verification — 2026-10-23

The interrupted implementation was inspected in place and retained. The explicit
paper-width label and corrected takeaway order-note fixture were already present.
No further application changes were needed during the resume audit.

All requested commands completed successfully: `npm run typecheck`, `npm run lint`,
`npm test` (67 passed, zero failures), `npm run build`,
`npm run test:integration`, and `npm run test:browser`.
The browser suite exercised grouped print/reprint, exclusion of later orders,
Ready with and without printing, snapshot options/notes, and all three languages
at both paper widths. The 58mm takeaway screenshot was also visually inspected.
Physical thermal output remains a manual hardware check; automated tests do not
claim printer delivery or cancellation detection.

## Changed files

Added:

- `src/models/KitchenPrintState.ts`
- `src/lib/kitchen-print.ts`
- `src/lib/services/kitchen-print.ts`
- `src/types/kitchen-ticket.ts`
- `src/app/api/dashboard/kitchen-print/[kind]/[id]/route.ts`
- `src/app/print/kitchen/[kind]/[id]/page.tsx`
- `src/app/print/kitchen/[kind]/[id]/not-found.tsx`
- `src/app/print/kitchen/[kind]/[id]/print.css`
- `src/components/dashboard/kitchen-print-action.tsx`
- `src/components/dashboard/kitchen-print-preview.tsx`
- `src/components/dashboard/kitchen-ticket.tsx`
- `tests/kitchen-print.test.ts`
- `tests/kitchen-print-http.ts`
- `tests/kitchen-print-browser.ts`
- `docs/KITCHEN-PRINTING.md`

Updated:

- `src/models/index.ts`
- `src/types/live-orders.ts`
- `src/lib/services/staff-orders.ts`
- `src/components/dashboard/live-orders.tsx`
- `src/components/dashboard/order-card.tsx`
- `src/components/dashboard/preparation-card.tsx`
- `src/i18n/messages/ar.json`, `he.json`, `en.json`
- `tests/integration.ts`
- `tests/preparation-browser.ts`
- `README.md`
