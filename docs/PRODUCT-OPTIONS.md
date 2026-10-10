# Product customization

Options are embedded in Product documents. Each group and option has a stable UUID, three names, active/default flags and a sort order. There are no additional collections or queries. Group types are SINGLE, MULTIPLE and INCLUDED. INCLUDED ingredients are always free; unchecking a default ingredient snapshots a removal rather than requiring a separate “No ingredient” option.

The current bounds are ten groups per product and twenty options per group. SINGLE has maximum one; all groups enforce `max(minSelections, required ? 1 : 0)` through `maxSelections`. Configuration rejects duplicate IDs, impossible limits, too many defaults, fractional/negative prices and paid INCLUDED ingredients. Required groups may have no default, requiring the customer to choose. Inactive choices never appear in the public DTO. Existing request-body limits remain enforced.

Staff uses Products → Edit → Product options. A prominent section at the top of Create/Edit Product provides Add option group and a shortcut to existing options. No terminal or database editing is needed. Add translated groups, select type, set limits and defaults, and enter extra prices in shekels. The editor converts decimal input to integer agorot. Set sort order to arrange groups/options; deactivate or remove them without altering historical orders. IDs remain unchanged while editing names/prices. Both existing staff roles retain the same tenant-scoped permissions.

Customer details show checkboxes or radio buttons and update the price immediately. SINGLE groups with minimum zero also offer Clear selection. No library was added. Horizontal product rows, search semantics, category navigation and the existing sheet remain intact.

Cart identity combines product ID, trimmed note and canonical sorted group/option IDs. Different customizations are separate lines. Persisted choices contain only IDs, never authoritative names or prices. Old v1 carts still parse. Old lines for products without groups behave as before; lines that now require configuration or reference removed/inactive choices remain visible with a localized review warning and block new submission. Their subtotal contribution is zero and the warning explains this. To review, remove the flagged line and select the product again. Choices are never silently substituted. Ambiguous pending submissions can still retry their original request and idempotency key.

At submission the server reloads the tenant-scoped Product inside the existing transaction, checks group/option membership, active state, duplicates and every selection limit, and calculates:

```
optionsTotal = sum(selected option priceDelta)
price = basePrice + optionsTotal          # final unit price, existing field
itemTotal = price * quantity
subtotal = sum(itemTotal)
```

Every amount is integer agorot. Client prices/names are stripped. The request fingerprint includes canonical selections; changing choices under the same UUID returns the existing conflict response. Failed validation does not allocate an order number or publish an event.

Order items add `basePrice`, `optionsTotal` and `optionGroups` snapshots. Each snapshot records translated group/option names, stable IDs, selected option deltas and removed default ingredients. The existing `price` remains the final unit price, preserving analytics and existing consumers. Staff cards and customer history render these snapshots, never the current catalog. Realtime still sends only invalidation signals. Product analytics continues grouping by the base product, with option revenue naturally included in item totals.

## Compatibility and rollout

No migration, new index or seed modification is required. Products without `optionGroups` are treated as empty. Older order items use `price` as their base price and zero options total; missing snapshot arrays render nothing. Legacy idempotency fingerprints for submissions without selections keep their previous shape. Product update requests that omit `optionGroups` preserve stored groups; explicitly sending `[]` clears current configuration only. Existing test and demo data remain unchanged.

Deploy server and UI together before staff begins configuring options. A browser tab running the old UI may not send required choices; the server rejects it safely. Reload the menu and reconfigure the affected line. Do not roll back to an application version that does not validate options after options have been enabled, as that older version would not enforce this configuration.

## Manual Classic Burger check

1. Set Classic Burger base price to ₪48.00 in the dashboard.
2. Add Vegetables, type INCLUDED, minimum 0 / maximum 4. Add translated Lettuce, Tomato, Pickles and Onion; mark each default-selected and active, price zero.
3. Add Extras, type MULTIPLE, minimum 0 / maximum 3. Add Extra Cheese ₪5.00, Egg ₪6.00 and Extra Patty ₪15.00, without defaults.
4. Add Sauce, type SINGLE, required, minimum 1 / maximum 1. Add Regular (default), Spicy and No Sauce, all free. Save.
5. Open `/r/salt?table=7`, open Classic Burger, uncheck Tomato, select Extra Cheese and Spicy, and set quantity two. The total must be ₪106.00. Adding Extra Patty too makes it ₪136.00.
6. Add to My Order, reload, and verify choices/total persist. Different choices must create separate cart lines; identical choices and notes merge.
7. Submit. Staff and customer history must show Without: Tomato, Extra Cheese and Spicy, in the selected language.
8. Edit Extra Cheese to ₪6.00. New submissions use the new price; the previous order remains ₪106.00 with its original snapshot.
9. Leave an extra-cheese item in a cart, deactivate that option, then reload the menu. The cart must require review and disable new submission. Remove/reconfigure it.
10. Repeat in Arabic, Hebrew and English; verify required choices, selection limits, availability and RTL/LTR.

## Optional isolated demo

The normal Salt seed deliberately leaves products without options. Customer customization appears only after staff saves a configuration. The existing Classic Burger is never overwritten by the optional demo.

For an isolated local example, create ignored `.env.demo.local` containing:

```dotenv
DSMENU_DEMO_MONGODB_URI=mongodb://127.0.0.1:27017/dsmenu_options_demo?replicaSet=rs0
```

Run `npm run seed:options-demo` with a local MongoDB replica set running. This command reads the dedicated demo variable, not the normal app URI in `.env.local`. It refuses production mode, remote hosts and database names other than `dsmenu_options_demo`. It inserts Salt's base data and a separate **Classic Burger (Options Demo)** with translated vegetables, extras and sauce. Reruns preserve existing products and edits to the demo product.

To view it, run an isolated local app configuration with `MONGODB_URI` pointing to that same database and the usual authentication environment settings. Use the documented index/user setup for this isolated database. No default staff password is created. This optional bootstrap is not required to configure options through the dashboard in your existing restaurant.

## Files

New: `src/lib/product-options.ts`, `src/models/product-options.ts`, `src/components/dashboard/options-editor.tsx`, `src/components/menu/option-selector.tsx`, `src/components/shared/option-summary.tsx`, `tests/option-fixture.ts`, `tests/options.test.ts`, `tests/options-http.ts`, `tests/options-browser.ts`, and this guide.

Modified:

- `src/models/Product.ts`, `src/models/Order.ts`
- `src/types/menu.ts`, `src/types/menu-management.ts`, `src/types/orders.ts`
- `src/lib/validators/menu-management.ts`, `src/lib/validators/orders.ts`
- `src/lib/services/restaurant.ts`, `src/lib/services/menu-management.ts`, `src/lib/services/customer-orders.ts`
- `src/lib/order-dto.ts`, `src/lib/cart.ts`, `src/lib/customer-security.ts`
- `src/components/menu/product-details.tsx`, `src/components/dashboard/menu-editor.tsx`, `src/components/dashboard/order-card.tsx`
- `src/components/cart/my-order.tsx`, `src/components/orders/customer-orders.tsx`, `src/components/orders/orders-provider.tsx`
- `src/i18n/messages/ar.json`, `src/i18n/messages/he.json`, `src/i18n/messages/en.json`
- `tests/integration.ts`, `README.md`

The follow-up audit modified `menu-editor.tsx`, `options-editor.tsx` and all three dictionaries to expose options immediately. It strengthened `tests/horizontal-menu.ts`, `tests/options-browser.ts` and `tests/integration.ts`. The optional isolated demo adds `scripts/options-demo-data.ts`, `scripts/seed-options-demo.ts`, `tests/options-demo.test.ts`, `tests/options-demo-integration.ts` and the package script. Existing working-tree changes remain intact.

Super Admin, dependent option rules, combos, option inventory/images, option-level analytics and payments are not implemented.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (47 passed, zero failures or skips), `npm run build`, `npm run test:integration` and `npm run test:browser` all passed in the follow-up audit. Previous tests remain intact. Coverage includes configuration/selection constraints, integer pricing, merging/persistence, old carts, stale choices, tenant scope, idempotency, immutable snapshots and the full staff/customer editor-to-order flow. Additional browser assertions check every horizontal row at 320/390/768/1280 pixels, visible options entry, group/option reordering, removal/deactivation and required choices without defaults. Demo integration tests verify reruns preserve owner edits. Screenshots were reviewed for the customer menu, customer options and tablet editor. Tests use a disposable MongoDB replica set and the existing mocked external provider transports; production data was not modified. Native touch scrolling is implemented with browser overflow scrolling; physical-device gesture feel was not assessed.
