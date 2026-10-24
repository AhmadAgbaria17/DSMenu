# Optional product notes

Staff can set **Allow customer notes** in Dashboard → Products → Create/Edit.
The Product field `allowCustomerNote` defaults to `true`. Public and management
DTOs treat an absent legacy field as enabled (`!== false`), so no backfill or
index migration is required. New product forms start checked and save the staff
choice explicitly. Older API clients that omit the field do not overwrite an
existing choice on edits.

When disabled, Product Details and cart note editing do not render a textarea.
Structured Product Options, quantity, pricing and cart customization identity
are unaffected. Labels and placeholders use the existing AR/HE/EN dictionaries.

Saved cart notes are not silently removed. A note that conflicts with the latest
product setting stays visible for review and blocks sending until the customer
removes the note or item. Keeping its line identity also preserves uncertain
submission retries and prevents accidental duplicate orders. New nonempty note
actions are rejected by the cart reducer for disabled products.

The shared table/takeaway order-pricing service reloads tenant-scoped products
from MongoDB and rejects a nonempty note on a disabled product with HTTP 422,
`NOTES_DISABLED`, affected product IDs, and a localized customer explanation.
Empty notes are allowed. If a stale page did not know about the new setting, the
server error offers explicit note removal in the cart. No order is created by
that rejected submission. A retry of an already committed order still returns
the original order through the existing idempotency flow.

Historical snapshots are never rewritten. Live Orders, customer history, Final
Bill and kitchen tickets continue to render saved notes, even after notes are
disabled on the product. Their existing conditional rendering omits empty note
sections. No billing, printing, payment or realtime semantics change.

Coverage: `tests/cart.test.ts`, `tests/customer-notes-http.ts`, and
`tests/customer-notes-browser.ts`, alongside the existing regression suites.
The browser test uses isolated Burger/Cola fixtures to exercise the same staff
form and customer ordering flow without changing the seeded restaurant menu.

Verified on 2026-10-24: typecheck, lint, all 68 unit tests, production build,
integration tests and the full browser suite passed. The browser suite includes
Arabic note submission, persistent cart review, Live Orders and a kitchen ticket
after disabling future product notes, plus AR/HE/EN labels and placeholders.

## Files for this change

- Model/DTOs: `src/models/Product.ts`, `src/types/menu.ts`,
  `src/types/menu-management.ts`, `src/types/orders.ts`.
- Validation/services: `src/lib/validators/menu-management.ts`,
  `src/lib/services/menu-management.ts`, `src/lib/services/restaurant.ts`,
  `src/lib/services/order-pricing.ts`.
- UI/cart: `src/components/dashboard/menu-editor.tsx`,
  `src/components/dashboard/menu-fields.tsx`,
  `src/components/menu/product-details.tsx`, `src/lib/cart.ts`,
  `src/components/cart/my-order.tsx`, `src/components/cart/cart-note.tsx`.
- Localization: `src/i18n/messages/ar.json`, `he.json`, `en.json`.
- Tests: `tests/cart.test.ts`, `tests/customer-notes-http.ts`,
  `tests/customer-notes-browser.ts`, `tests/integration.ts`. Existing accessible
  label selectors were updated in `tests/browser-flows.ts`,
  `tests/options-browser.ts`, and `tests/table-bill-browser.ts`.
- Documentation: `docs/CUSTOMER-NOTES.md`.
