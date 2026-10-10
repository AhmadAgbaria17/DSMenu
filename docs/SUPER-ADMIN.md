# Platform administration

`/admin` is the DSMenu platform area. It is separate from `/dashboard`. Normal OWNER and STAFF accounts are redirected out of admin pages and receive 403 from admin APIs. Anonymous callers are sent to login (401 for APIs). Super Admins cannot use restaurant APIs or operate menus as a restaurant user.

## Bootstrap once

Use the existing database configuration (`MONGODB_URI`) and authentication configuration. MongoDB must support transactions (Atlas or a replica set). Apply `npm run db:indexes` before creating accounts; bootstrap and onboarding refuse to run without the unique email/slug indexes. Existing indexes are unchanged and no data migration is needed.

From a trusted PowerShell terminal, prompt for the password without putting it in shell history:

```powershell
$adminPassword = Read-Host 'Super Admin password' -AsSecureString
try {
  $env:DSMENU_SUPER_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminPassword).Password
  npm run create-super-admin -- --name "Ahmad Agbaria" --email "ah.agbaria.99@gmail.com"
} finally {
  Remove-Item Env:DSMENU_SUPER_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $adminPassword.Dispose()
}
```

Choose your own email and password (at least 12 characters, at most 72 UTF-8 bytes). Whitespace is preserved. There is no default password and no public registration. The CLI is insert-only: an existing email cannot be overwritten. Do not commit the temporary environment variable or store it in a public `NEXT_PUBLIC_` variable. The existing `create-user` and `create-restaurant` utilities remain available.

Log in through `/login`. Super Admins reach `/admin`; restaurant users reach `/dashboard`. No real Super Admin was created automatically during development or testing.

## Routes and workflow

- `/admin`: total/active/inactive restaurant counts and restaurant user count.
- `/admin/restaurants`: paginated list (50 per page), first owner email, creation date and activation controls.
- `/admin/restaurants/new`: restaurant and initial OWNER form.
- `/api/admin/restaurants`: authorized GET list and POST onboarding.
- `/api/admin/restaurants/[id]`: authorized PATCH activation only.

Enter restaurant name, lowercase URL-safe slug, owner name/email and temporary password. Arabic default, AR/HE/EN and ILS are shown as the existing supported settings; timezone remains the existing Asia/Jerusalem configuration. No new language/currency behavior is introduced. No products/tables are required at creation. Staff can configure them later.

Restaurant and OWNER creation uses one MongoDB transaction. The owner is always active, role OWNER, and linked to the newly inserted restaurant. A duplicate normalized email, duplicate slug or transaction failure leaves neither a partial restaurant nor a partial owner. Unique indexes handle concurrent duplicate requests. The API returns only restaurant ID and slug. There is no online operation for creating a SUPER_ADMIN.

The password follows the employee policy and is bcrypt hashed with cost 12 before the transaction. Only the hash enters MongoDB. It is not logged or returned. The form clears the password after a server submission and shows only a success message. Share the temporary password securely yourself before leaving the form. "Temporary" means an administrator-chosen initial credential: forced rotation, password reset and email delivery are not implemented. A network error may happen after a successful commit; check the list before retrying. The unique slug/email constraints prevent duplicate creation.

Activation requires confirmation and updates only Restaurant.isActive. Existing inactive-menu and staff-auth rules then apply. Existing sessions are revalidated against live database state; deactivation blocks them. Historical orders, visits, calls, users and menus are preserved. Reactivation restores access according to existing session/login behavior. There is no hard delete.

## Security boundaries

User.restaurantId is required for OWNER/STAFF and prohibited for SUPER_ADMIN on document validation. Authentication additionally rejects inconsistent records, so raw invalid database updates cannot create a usable cross-boundary identity. Auth.js claims explicitly distinguish a platform identity without restaurantId from a restaurant identity. Every request revalidates the active user, role and authVersion; restaurant sessions additionally require an active restaurant. Logout revokes copied session cookies via authVersion.

`requireSuperAdmin()` protects every platform service; pages independently guard rendering. Mutations require same-origin JSON requests with bounded bodies and strict Zod inputs. Staff validators still accept only OWNER/STAFF. Client-provided role/restaurantId fields cannot grant privileges. DTOs expose no hashes, tokens or authVersion. No impersonation or fallback tenant exists.

## Manual test

1. Bootstrap, log in, open `/admin` and then Create restaurant.
2. Create Salt Test / `salt-test`, with your owner email and a valid temporary password.
3. Confirm it appears in Restaurants. Log out and log in as its OWNER.
4. Confirm `/dashboard` shows Salt Test with no other restaurant's data. Visit `/admin` and confirm access is rejected.
5. Log in as platform admin again. Deactivate Salt Test and confirm its public menu and employee login are blocked. Reactivate and confirm login works.
6. Try duplicate email/slug and invalid input. Confirm clear errors and no partial restaurant.
7. Switch Arabic/Hebrew/English and review tablet/mobile layouts.

## Files

Created: `src/app/admin/{layout,page,loading,error}.tsx`, `src/app/admin/restaurants/page.tsx`, `src/app/admin/restaurants/new/page.tsx`, `src/app/api/admin/restaurants/route.ts`, `src/app/api/admin/restaurants/[id]/route.ts`, `src/components/admin/{create-restaurant-form,restaurant-activation}.tsx`, `src/lib/{platform-context,platform-bootstrap}.ts`, `src/lib/services/platform.ts`, `src/lib/validators/platform.ts`, `scripts/create-super-admin.ts`, `tests/{platform.test,platform-http,platform-browser}.ts`, and this guide.

Modified: `src/models/User.ts`, `src/lib/validators/staff.ts`, `src/lib/services/staff-auth.ts`, `src/lib/auth.ts`, `src/lib/staff-context.ts`, `src/lib/staff-http.ts`, `src/lib/restaurant-admin.ts` (comment only), `src/types/next-auth.d.ts`, `src/app/login/page.tsx`, all three translation dictionaries, `tests/integration.ts`, `package.json`, and `README.md`.

No dependencies were added. No subscription, billing, payment, invitation, email, reset, impersonation, hard delete, additional-user management or operational menu management was added to admin.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (49 passed, zero failures/skips), `npm run build`, `npm run test:integration` and `npm run test:browser` passed. Existing tests were retained. New tests cover platform/tenant guards, role injection, bootstrap CLI, password hashing and normalization, duplicate/racing requests, transaction rollback, activation, history retention, session revocation and the complete admin-to-owner browser flow. English list and Arabic/Hebrew form screenshots were reviewed. Tests use disposable MongoDB and mocked external provider transports; no production data or credentials were changed.
