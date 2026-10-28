# Restaurant kitchen printing preference

The switch is at **Restaurant Settings → Kitchen Settings → Enable kitchen ticket
printing**, translated in Arabic, Hebrew and English with RTL/LTR support.
It uses `Restaurant.kitchenPrintingEnabled`, default true for new restaurants;
missing legacy fields also resolve to true. It remains in the existing shared
database Restaurant document. No tenant-routing or permission changes are made.

Disabled restaurants retain all Orders, preparation batches and KitchenPrintState
metadata. Print, Reprint and Printed counts disappear from Live Orders. The normal
refresh/revalidation updates the flag. Both table and takeaway tickets use it.
Start Preparing and Mark Ready retain their existing behavior.

Server checks derive the restaurant from staff authentication, never a client
boolean. API requests to read/record tickets return 403 when disabled; the page
shows a localized disabled message without rendering ticket data. Recording also
serializes with concurrent settings changes inside its existing transaction.
Re-enabling makes the original print counts available again. A ticket previously
delivered to a browser cannot be recalled, but new application print attempts are
authorized again on the server.

## Files changed for this setting

- `src/models/Restaurant.ts`
- `src/types/menu-management.ts`, `src/types/live-orders.ts`
- `src/lib/validators/menu-management.ts`, `src/lib/staff-http.ts`
- `src/lib/services/menu-management.ts`, `staff-orders.ts`, `kitchen-print.ts`
- `src/components/dashboard/restaurant-settings.tsx`, `live-orders.tsx`,
  `preparation-card.tsx`, `order-card.tsx`, `kitchen-print-action.tsx`,
  `kitchen-print-preview.tsx`
- `src/app/print/kitchen/[kind]/[id]/page.tsx`
- `src/i18n/messages/ar.json`, `he.json`, `en.json`
- `tests/menu-management.test.ts`, `tests/kitchen-print-http.ts`,
  `tests/kitchen-print-browser.ts`
- `docs/KITCHEN-PRINTING.md`, `docs/KITCHEN-PRINTING-SETTING.md`

No new dependencies, environment variables, indexes or data migration are required.

Verified on 2026-10-27: typecheck, lint, 71 unit tests, production build,
integration tests and the full browser suite passed. Browser coverage includes
grouped/takeaway controls, saved counts after re-enabling, disabled direct and
already-open previews, and settings/messages in AR/HE/EN with RTL/LTR. An initial
new test selector also matched Next.js's route announcer; it was scoped to the
page's main content, retaining the exact disabled-message assertion, and the full
suite then passed.
