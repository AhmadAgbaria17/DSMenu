# Table access codes

Table QR URLs remain `/r/salt?table=7`. The customer sees either **Start Table 7 / Choose a new 3-digit code** or **Join Table 7 / Enter the existing code** before the table menu. Arabic, Hebrew and English are supported. Codes are exactly three ASCII digits; `027` is valid. Public browsing without a table and takeaway keep their existing entry flows.

## Session lifetime and security

- `TableSession.accessCode` is a string, excluded from normal Mongoose projections. It is never stored on Table. Authorized staff see it in Dashboard → Tables for the active visit only.
- The code is protected session data stored in readable form because staff must retrieve it. It is a low-entropy shared entry gate, not a replacement for authentication. The existing random 256-bit credential is issued only after successful create/join, stored hashed in MongoDB and delivered in the scoped HttpOnly/SameSite cookie (Secure in production).
- GET `/api/r/{slug}/tables/{number}/session` returns entry mode and, where needed, the current session ID; never the code. POST accepts strict CREATE/JOIN/SETUP inputs. JOIN includes the session ID displayed by GET, preventing an old form from silently joining a later visit. An empty POST only resumes an already valid credential.
- Five incorrect guesses trigger a temporary five-minute window measured from the first failed attempt. Counters commit transactionally in MongoDB, surviving app restarts and multiple instances. Already-authorized devices remain usable during cooldown. The temporary limit is shared by the visit, so one device's failures can temporarily delay other new joiners.
- Creation uses the existing table lifecycle transaction and partial unique active-session index. A concurrent losing CREATE gets 409 and the UI switches to JOIN; no credential is issued to the loser.
- Manual closure and empty-session cleanup atomically remove the code and counters while marking CLOSED. All existing customer authorization still requires ACTIVE. Old credentials, old session IDs and the old code cannot authorize the next visit. The next customer must explicitly choose a code. Codes are never copied from previous visits, and historical orders are retained.
- Codes do not enter URLs, QR codes, customer DTOs, realtime events, analytics, localStorage or logs. Only tenant-authorized table management returns them. Session IDs alone are not credentials.

## Existing visits at deployment

A code-less ACTIVE visit is not assigned a default or automatically claimed. An already-authorized browser is prompted to choose its initial code (SETUP). Unverified visitors are asked to have someone already at the table reopen the menu to set it. Existing valid device credentials continue to authorize existing operations. A visit with no remaining authorized device can be closed by staff through the usual workflow, after completing orders/resolving calls. Its next visit starts normally.

No new dependency, secret, permanent table PIN, optional staff reset action or data migration is introduced. Keep the existing unique active-session index deployed via `npm run db:indexes`.

## Reset verification

1. Open an available Table 7 on device A and create `527`.
2. Device B must see JOIN; enter `527` and confirm it joins the same visit.
3. Refresh either device: the menu remains available without re-entering the code.
4. Dashboard → Tables shows Table 7 / Table Code 527. Close the visit through the final-bill confirmation (finish active work first).
5. Old device credentials and JOIN requests for that visit fail. The code disappears from the staff table card.
6. Reopen Table 7: CREATE is displayed with an empty input. Choose `314`.
7. A different/previous device must now JOIN. `527` fails; `314` works.
8. Dashboard → Tables displays only 314 for the new visit. Session A remains CLOSED without an access code; Session B has a different ID.

`tests/table-access-http.ts` uses raw requests for reset, credential rejection, tenant isolation, cooldown, races, legacy setup and automatic cleanup. `tests/table-access-browser.ts` exercises the exact Table 7 / 527 / close / 314 flow with three ordering devices, a fresh browser for the next visit, and the real staff close dialog, plus AR/HE/EN and RTL checks. Existing business-flow tests use `table-access-fixture.ts` to explicitly enter fixture code 027 through the real API/form; their original order/service/printing assertions remain in place.

## Main files

- `src/models/TableSession.ts`, `src/lib/table-access.ts`: schema and strict input/state types.
- `src/lib/services/customer-session.ts`, session route: trusted scope, verification, throttling and credentials.
- `src/components/menu/table-access-entry.tsx`, public restaurant page: entry UI.
- `src/components/orders/orders-provider.tsx`: authorized state read, no automatic session creation.
- `src/lib/services/tables.ts`, `empty-table-sessions.ts`: staff projection and atomic code removal.
- `src/components/dashboard/tables-manager.tsx`, `src/types/tables.ts`: active staff code display.
- `src/i18n/messages/{ar,he,en}.json`, `src/types/orders.ts`: localized gate/errors.
- `tests/table-access.test.ts`, HTTP/browser tests and existing fixture adaptations.

## Change manifest

- `README.md`
- `docs/TABLE-ACCESS.md`
- `src/app/api/r/[slug]/tables/[table]/session/route.ts`
- `src/app/r/[slug]/page.tsx`
- `src/components/dashboard/tables-manager.tsx`
- `src/components/menu/table-access-entry.tsx`
- `src/components/orders/orders-provider.tsx`
- `src/i18n/messages/ar.json`
- `src/i18n/messages/en.json`
- `src/i18n/messages/he.json`
- `src/lib/services/customer-session.ts`
- `src/lib/services/empty-table-sessions.ts`
- `src/lib/services/tables.ts`
- `src/lib/table-access.ts`
- `src/models/TableSession.ts`
- `src/types/orders.ts`
- `src/types/tables.ts`
- `tests/browser-flows.ts`
- `tests/customer-notes-browser.ts`
- `tests/customer-notes-http.ts`
- `tests/empty-table-sessions-http.ts`
- `tests/integration.ts`
- `tests/kitchen-print-http.ts`
- `tests/live-browser.ts`
- `tests/live-http.ts`
- `tests/menu-browser.ts`
- `tests/menu-http.ts`
- `tests/option-templates-browser.ts`
- `tests/option-templates-http.ts`
- `tests/options-browser.ts`
- `tests/options-http.ts`
- `tests/order-browser.ts`
- `tests/order-http.ts`
- `tests/preparation-browser.ts`
- `tests/preparation-http.ts`
- `tests/product-image-browser.ts`
- `tests/service-browser.ts`
- `tests/service-http.ts`
- `tests/table-access-browser.ts`
- `tests/table-access-fixture.ts`
- `tests/table-access-http.ts`
- `tests/table-access.test.ts`
- `tests/table-bill-browser.ts`
- `tests/table-bill-http.ts`
- `tests/table-browser.ts`
- `tests/table-http.ts`
- `tests/takeaway-browser.ts`
- `tests/takeaway-http.ts`

For focused regression checks: npm run test:integration -- --table-access-only. This uses disposable MongoDB, a production Next.js server and real Playwright entry/close forms. The default integration/browser commands still run all existing suites.

## Verification results (2026-10-29)

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS, no warnings |
| npm test | PASS, 74 tests, 0 failed, 0 skipped |
| npm run build | PASS |
| npm run test:integration | PASS, all database/HTTP suites |
| npm run test:browser | PASS, all existing browser and integration suites plus access-code reset |
| npm run test:integration -- --table-access-only | PASS, focused security/reset browser checks |

The reset browser scenario verifies three devices submitting into one Table 7 session with code 527, normal grouped preparation and final-bill closure, rejected old credentials, a fresh browser creating code 314, rejection of 527, and staff displaying only 314. It also checks the losing-creator JOIN transition and leading-zero code 027. Arabic/Hebrew/English entry screens and the staff code display were visually reviewed. Pusher and Cloudinary network transports use existing test mocks; MongoDB transactions and HTTP/browser authorization run against a disposable replica set and the production Next.js build.

At resumption the core implementation was already present. Remaining work was completing full verification, adding the three-device/fresh-browser cases, correcting fixtures that reused an intentionally disabled staff account, and scoping browser assertions away from Next.js's hidden streaming copies/route announcer. Original business/security assertions remain; the options card assertion now targets its exact persisted Order ID in the visible main content. No unrelated product feature or optional staff code reset was added.
