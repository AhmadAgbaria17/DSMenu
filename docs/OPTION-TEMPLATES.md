# Reusable option group templates

## Staff workflow

Products links to **Saved Option Groups** at `/dashboard/option-templates`. Staff can search, create, edit, duplicate, activate/deactivate or delete templates. Every template contains a staff-facing name, an availability flag and one complete translated option group. The existing option editor supports INCLUDED, MULTIPLE and SINGLE, all defaults, limits, prices and translated names.

In Product Create/Edit, choose **Use Saved Group**, search and select a template. The editable group is added immediately; save the product normally. A product may contain multiple templates within the existing ten-group limit. **Save as Template** on any product group saves its current form values (including unsaved edits) under a name entered by staff. The group must pass the existing option configuration validation. This action does not save or remove the product group.

Example: edit Classic Burger, configure Vegetables with Lettuce, Tomato, Pickles and Onion, and save the group as `Burger Vegetables`. Create Double Burger, choose that saved group, remove Pickles and save. Classic Burger and the template keep Pickles; the customer sees the three remaining ingredients for Double Burger.

## Data and isolation

`ProductOptionTemplate` is a separate collection with `restaurantId`, `templateName`, `isActive`, one embedded `group`, and timestamps. Its nonunique `{ restaurantId, templateName }` index supports tenant listings without prohibiting duplicate staff names. Run the existing `npm run db:indexes` deployment command to create the new index in production. No dependency, environment variable, historical backfill or live synchronization is introduced.

All API services authenticate with the existing staff guard and derive the restaurant from that session. Foreign, missing, inactive (for use) and malformed template IDs cannot retrieve a group. Writes use the existing same-origin and bounded JSON helpers. Payloads reject ownership fields and reuse full option configuration validation, including integer agorot prices.

The authenticated use endpoint produces new UUIDs for the group and every option. Saving a template also creates its own independent IDs. Products persist an optional `sourceTemplateId` solely for the editor's duplicate-add warning; it is not a relationship, authorization credential or pricing input. It is deliberately not dereferenced when saving or ordering a product, so deleting a template cannot break an existing product. Old products without this field still work. Removing the copied group allows staff to add it again. Reopening a saved product preserves the duplicate warning.

Template changes affect future uses only. Deletion removes just the template document, never products or historical orders. The order services continue validating and pricing against the actual product and snapshotting its selected options. They never query templates.

## Files

New:
- `src/models/ProductOptionTemplate.ts`
- `src/lib/option-templates.ts`
- `src/lib/services/option-templates.ts`
- `src/app/api/dashboard/option-templates/route.ts`
- `src/app/api/dashboard/option-templates/[id]/route.ts`
- `src/app/api/dashboard/option-templates/[id]/use/route.ts`
- `src/app/dashboard/option-templates/page.tsx`
- `src/components/dashboard/template-actions.tsx`
- `src/components/dashboard/option-template-management.tsx`
- `tests/option-templates.test.ts`
- `tests/option-templates-http.ts`
- `tests/option-templates-browser.ts`

Modified: model exports; option group schema/validator (optional provenance); product menu editor, option editor and Products link; Arabic/Hebrew/English dictionaries; integration runner; README.

## Verification

Unit tests cover input boundaries, preserved configuration, fresh IDs, deep-copy independence and duplicate provenance. HTTP tests cover authentication/origin checks, cross-tenant listing/use/edit/delete/duplicate rejection, copying multiple groups, deletion/deactivation, future-only changes, product-derived pricing and immutable historical snapshots. The browser test saves an existing group, applies it to Double Burger, removes Pickles, verifies the original/template remain unchanged, verifies duplicate prevention after reopening and checks customer options plus responsive Arabic/Hebrew management screens.

The existing complete cart/order, takeaway, realtime, menu/Cloudinary, table/QR, analytics and Super Admin suites remain in the test runner. Tests use disposable databases and mocked external transports; they do not mutate the deployed restaurant database.

Verified on October 16, 2026: `npm run typecheck`, `npm run lint`, `npm test` (56 passed, zero failed/skipped), `npm run build`, `npm run test:integration` and `npm run test:browser` all passed. Arabic/Hebrew management screenshots and the Double Burger customer sheet were visually reviewed. The initial lint error caused by a server helper named like a React hook was fixed by renaming it to `copyTemplateGroup`; lint passed afterward.
