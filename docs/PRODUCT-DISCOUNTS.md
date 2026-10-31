# Product discount prices

In Dashboard → Products → Create/Edit, enter **Discount price (optional)** beneath the regular price. Clear the field and save to remove it. Labels, validation and helper text are translated into Arabic, Hebrew and English.

`Product.price` remains the regular price in integer agorot. Optional `discountPrice` is also integer agorot: zero is valid, but it must be strictly below `price`. Missing/null means no discount. No migration or new environment variables/dependencies are required.

Management requests use decimal strings, parsed without floating-point multiplication. A blank discount becomes null. Older clients omitting the field preserve the saved value; an atomic query condition prevents those clients from reducing the regular price below an existing discount. Mongoose document validation and API Zod validation enforce the constraints. Dashboard operations retain authenticated restaurant scoping.

The shared `effectiveBasePrice` helper selects a valid discount, otherwise the regular price. Both public cards and details use `ProductPrice`, displaying the original with `<del>` and the charged base in bold. The component wraps within existing card dimensions and contains its screen-reader labels for RTL layouts.

Cart and server calculations use:

```
effective base = valid discountPrice ?? price
unit price = effective base + selected option deltas
item total = unit price × quantity
subtotal = sum of item totals

(3900 + 500) × 2 = 8800 agorot = ₪88.00
```

The server reloads tenant-scoped, available products and validates option selections inside the existing order transaction. Client prices/subtotals are not authoritative. TABLE and TAKEAWAY share this implementation.

Each new order item snapshots `regularPriceAtOrder`, `discountApplied`, `basePrice` (charged base), `optionsTotal`, `price` (charged unit), and `itemTotal`. Legacy items remain readable using existing base/unit prices as fallbacks. Removing/changing a discount never reprices historical orders, final bills, analytics, or committed idempotent retries. Kitchen ticket formatting is unchanged.

## Regression coverage

- `tests/product-discount.test.ts`: integer/zero/legacy pricing, schema and form validation, cart options and quantities.
- `tests/product-discount-http.ts`: real management/order APIs, persistence/removal, omitted-field guard, foreign tenant rejection, forged prices, TABLE/TAKEAWAY totals, snapshots, retries, bills and analytics.
- `tests/product-discount-browser.ts`: form errors/save/clear; AR/HE/EN cards/details; responsive RTL/LTR; extras, quantity, cart and submitted order.

The integration runner includes these checks in the full suites. For focused development after `npm run build`, use `npm run test:browser -- --discount-only`. Tests use disposable MongoDB, not the configured production database.

Verified on 2026-10-31:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0 |
| `npm test` | 80 passed, 0 failed, 0 skipped; exit 0 |
| `npm run build` | Passed, exit 0 |
| `npm run test:integration` | Full suite passed, exit 0 |
| `npm run test:browser` | Full suite passed, exit 0 |

Browser checks cover 320/390/768/1280px, Arabic/Hebrew/English, RTL/LTR, search prices, details, dashboard validation/save/clear and submitted discounted totals. Existing horizontal scrolling, image framing, orders, authentication, realtime, options, printing, bills, analytics, takeaway and table-session suites also pass. External realtime/upload transports remain mocked by the existing test harness; MongoDB transactions, application routes and browser interactions are real.

## Changed files

New:

- `src/lib/product-price.ts`
- `src/components/menu/product-price.tsx`
- `tests/product-discount.test.ts`
- `tests/product-discount-http.ts`
- `tests/product-discount-browser.ts`
- `docs/PRODUCT-DISCOUNTS.md`

Modified:

- `src/models/Product.ts`
- `src/models/Order.ts`
- `src/types/menu.ts`
- `src/types/menu-management.ts`
- `src/types/orders.ts`
- `src/lib/validators/menu-management.ts`
- `src/lib/services/menu-management.ts`
- `src/lib/services/restaurant.ts`
- `src/lib/services/order-pricing.ts`
- `src/lib/order-dto.ts`
- `src/lib/cart.ts`
- `src/components/dashboard/menu-editor.tsx`
- `src/components/menu/product-card.tsx`
- `src/components/menu/product-details.tsx`
- `src/i18n/messages/ar.json`
- `src/i18n/messages/he.json`
- `src/i18n/messages/en.json`
- `tests/integration.ts`
- `README.md`
