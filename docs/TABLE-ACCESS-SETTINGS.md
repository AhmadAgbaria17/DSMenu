# Restaurant table access-code setting

Restaurant Settings → **Table Security** contains **Require a 3-digit table access code**, with ON/OFF explanations and a notice that changes apply to new visits. OWNER/STAFF use the existing settings permissions. All text is localized in Arabic, Hebrew and English.

`Restaurant.tableAccessCodeEnabled` is the single source of truth for the default policy of new visits. New restaurants default to `true`; absent legacy fields are explicitly interpreted as `true` without a migration. Older settings clients omitting the field preserve its saved value. No new dependencies, environment variables or indexes are required.

## Active-session policy

Every newly created `TableSession` stores immutable `accessCodeRequired`. The server copies the current restaurant setting inside its creation transaction. The restaurant policy read is serialized with settings writes; the table lifecycle lock and existing partial unique index still prevent duplicate active visits.

| Visit started with | Restaurant setting changes to | Existing visit | Next visit after closure |
| --- | --- | --- | --- |
| ON | OFF | Requires its existing code for new devices | Opens directly |
| OFF | ON | Opens directly for new devices | Requires a newly chosen code |

This uses the request's recommended final snapshot rule. Switching OFF does **not** remove protection from an already-active protected session. Switching ON does **not** require an absent code from customers in an already-active unprotected session. Settings changes do not rewrite sessions, remove codes, reset counters, close visits or delete orders.

Legacy sessions with no snapshot remain protected (`accessCodeRequired !== false`), regardless of the current restaurant preference. Existing legacy SETUP/WAIT behavior remains available for code-less protected visits; an already-authorized device can set their code. New sessions created while OFF explicitly store `false`, have no access code and never need SETUP.

## Customer entry and authorization

- Protected visits retain CREATE/JOIN, three-digit validation, leading zeros, persistent guessing cooldown, credential limits and stale-session checks.
- Unprotected entry returns OPEN mode. The customer entry component automatically sends a same-origin POST with `{ action: 'OPEN', sessionId }`, where `null` represents starting an available table. No code form is rendered. GET never creates credentials or sessions.
- The server independently reads the restaurant policy for a new session, or the existing session snapshot for a join. Client policy booleans and fake codes are rejected by strict validation. A stale OPEN request cannot open a protected session; the UI reconciles to the current gate.
- Both modes use the same random 256-bit credential, hashed database storage, scoped HttpOnly/SameSite cookie, Secure in production, expiry and per-visit credential limit. The three-digit gate is the only feature being disabled. Knowing a URL still cannot submit orders/services without obtaining a valid credential.
- Anonymous joining is intentionally allowed for unprotected sessions. Each device still receives its own credential for the same visit. An authorized refresh reads the session and does not create another visit.
- Dashboard Tables returns/displays a code only when the active visit is protected. It shows no empty or fake code for unprotected visits.
- Closure invalidates credentials in both modes and clears any protected code. Empty-session cleanup uses its existing activity/order/service rules, independent of the code setting. The next visit reads the latest restaurant preference.
- Takeaway and public menu browsing without a table are unchanged. No policy/code is added to realtime events, QR URLs or order/service payloads.

## Verification

`tests/table-access-setting.test.ts` checks model defaults, immutable snapshots, strict OPEN inputs and settings validation. `tests/table-access-setting-http.ts` checks persistence, missing-field defaults, both toggle directions, simultaneous unprotected joins, hashed/HttpOnly credentials, forged client policy, tenant isolation, orders/service requests, retained history and automatic cleanup. Existing protected-session throttling and reset suites remain enabled.

`tests/table-access-setting-browser.ts` saves/reloads the real settings form, creates protected Table 7 with 527, verifies protected joins after OFF, opens Table 8 directly on two devices with working order/service actions, and exercises Table 9 OFF → ON → close → protected 314 → OFF → close → direct entry. It checks no code on unprotected dashboard cards, AR/HE/EN, RTL/LTR and widths 390/768/1280, plus unchanged public browsing/takeaway entry.

Focused command: `npm run test:integration -- --table-setting-only`. Standard integration/browser commands include the new suites without skipping existing tests. Tests use disposable MongoDB and the existing mocked external transports.

## Files changed

- `src/models/Restaurant.ts`, `src/models/TableSession.ts`
- `src/lib/validators/menu-management.ts`, `src/types/menu-management.ts`
- `src/lib/services/menu-management.ts`, `src/lib/services/customer-session.ts`, `src/lib/services/tables.ts`
- `src/lib/table-access.ts`
- `src/components/dashboard/restaurant-settings.tsx`, `src/components/menu/table-access-entry.tsx`
- `src/i18n/messages/ar.json`, `src/i18n/messages/he.json`, `src/i18n/messages/en.json`
- `tests/table-access-setting.test.ts`, `tests/table-access-setting-http.ts`, `tests/table-access-setting-browser.ts`, `tests/table-access-fixture.ts`, `tests/integration.ts`
- `README.md`, `docs/TABLE-ACCESS.md`, `docs/TABLE-ACCESS-SETTINGS.md`

## Results (2026-10-30)

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS, no warnings |
| npm test | PASS: 77 tests, 0 failed, 0 skipped |
| npm run build | PASS |
| npm run test:integration | PASS: all existing and new database/HTTP suites |
| npm run test:browser | PASS: all existing and new browser/integration suites |
| npm run test:integration -- --table-setting-only | PASS: focused settings HTTP/browser checks |

English, Arabic and Hebrew settings screenshots were visually reviewed. Existing tests retain their assertions; the shared entry fixture now understands OPEN in addition to protected CREATE/JOIN. No live restaurant database or external provider was used for these tests.
