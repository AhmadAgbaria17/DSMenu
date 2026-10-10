import { canonicalSelections } from './product-options';
import { cartLineKey } from './cart';
import { createHash, randomBytes } from 'node:crypto';
import type { OrderInput } from '@/lib/validators/orders';

export const CREDENTIAL_LIFETIME_SECONDS = 12 * 60 * 60;
export const MAX_VISIT_CREDENTIALS = 32;
export function newCustomerToken() { return randomBytes(32).toString('base64url'); }
export function tokenHash(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null;
}
export function customerCookieName(restaurantId: string, tableNumber: number) {
  return `dsmenu-visit-${restaurantId}-${tableNumber}`;
}
export function orderFingerprint(input: OrderInput) {
  const items = input.items.map(({ productId, quantity, note, selections }) => ({ productId, quantity, note, ...(selections?.length ? { selections: canonicalSelections(selections) } : {}) })).sort((a, b) => cartLineKey(a).localeCompare(cartLineKey(b)));
  return createHash('sha256').update(JSON.stringify(items)).digest('hex');
}
