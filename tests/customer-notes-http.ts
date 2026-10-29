import { tableAccessFetch as fetch } from './table-access-fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Category, Product, Order, Table } from '../src/models';
import { createStaffUser } from '../src/lib/staff-users';
import { AuthClient, type StaffFixture } from './staff-http';
import type { ManagedMenu } from '../src/types/menu-management';
import { optionFixture } from './option-fixture';
import { defaultSelections } from '../src/lib/product-options';

export async function runCustomerNotesHttpChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Notes Staff', email: 'notes@salt.local', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('notes@salt.local', fixture.password);
  const category = await Category.create({ restaurantId: fixture.restaurantId, nameAr: 'Notes', nameHe: 'Notes', nameEn: 'Notes', sortOrder: 99 });
  const groups = optionFixture();
  const input = { categoryId: String(category._id), nameAr: 'Notes Burger', nameHe: 'Notes Burger', nameEn: 'Notes Burger', descriptionAr: '', descriptionHe: '', descriptionEn: '', price: '48.00', sortOrder: 0, isAvailable: true, isFeatured: false, isArchived: false, optionGroups: groups };
  const save = (body: unknown, id?: string) => staff.request(`/api/dashboard/products${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const created = await save(input); assert.equal(created.status, 200); const { id: burgerId } = await created.json() as { id: string };
  assert.equal((await Product.findById(burgerId).orFail()).allowCustomerNote, true);
  // Raw unset simulates old MongoDB documents, including lean reads without defaults.
  await Product.collection.updateOne({ _id: (await Product.findById(burgerId).orFail())._id }, { $unset: { allowCustomerNote: '' } });
  let managed = await (await staff.request('/api/dashboard/menu')).json() as ManagedMenu;
  assert.equal(managed.products.find(p => p.id === burgerId)?.allowCustomerNote, true);
  const colaResponse = await save({ ...input, nameAr: 'Notes Cola', nameHe: 'Notes Cola', nameEn: 'Notes Cola', allowCustomerNote: false });
  assert.equal(colaResponse.status, 200); const { id: colaId } = await colaResponse.json() as { id: string };
  assert.equal((await save({ ...input, allowCustomerNote: 'false' }, colaId)).status, 400);
  const foreign = await Product.findOne({ restaurantId: { $ne: fixture.restaurantId } }).orFail();
  assert.equal((await save({ ...input, allowCustomerNote: false }, String(foreign._id))).status, 404);
  await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 208 });
  const post = (path: string, body: unknown, cookie = '') => fetch(base + path, { method: 'POST', headers: { Origin: base, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const visit = await post('/api/r/salt/tables/208/session', {}); assert.equal(visit.status, 200);
  const cookie = visit.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const selections = defaultSelections(groups);
  const orderInput = (productId: string, note: string) => ({ clientRequestId: randomUUID(), items: [{ productId, note, quantity: 1, selections }] });
  const originalInput = orderInput(burgerId, 'Cut in half');
  const original = await post('/api/r/salt/tables/208/orders', originalInput, cookie); assert.equal(original.status, 200);
  const originalId = (await original.json()).order.id as string;
  const before = await Order.findById(originalId).lean().orFail();
  assert.equal(before.items[0].notes, 'Cut in half');
  assert.equal((await save({ ...input, allowCustomerNote: false }, burgerId)).status, 200);
  // An older client omitting the new field must not silently re-enable it.
  assert.equal((await save(input, burgerId)).status, 200);
  managed = await (await staff.request('/api/dashboard/menu')).json() as ManagedMenu;
  assert.equal(managed.products.find(p => p.id === burgerId)?.allowCustomerNote, false);
  const denied = await post('/api/r/salt/tables/208/orders', orderInput(burgerId, 'Cut in half'), cookie);
  assert.equal(denied.status, 422); assert.equal((await denied.json()).error.code, 'NOTES_DISABLED');
  const retry = await post('/api/r/salt/tables/208/orders', originalInput, cookie);
  assert.equal(retry.status, 200); assert.equal((await retry.json()).order.id, originalId, 'committed retry remains valid after disabling notes');
  assert.deepEqual(await Order.findById(originalId).lean().orFail(), before);
  const withoutNote = await post('/api/r/salt/tables/208/orders', orderInput(colaId, ''), cookie); assert.equal(withoutNote.status, 200);
  const takeaway = await post('/api/r/salt/takeaway/session', { customerName: 'Notes test', customerPhone: '0501234567' }); assert.equal(takeaway.status, 200);
  const takeawayVisitId = (await takeaway.json()).visitId as string;
  const takeawayCookie = takeaway.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const rejectedTakeaway = await post('/api/r/salt/takeaway/orders', { ...orderInput(colaId, 'Unexpected note'), takeawayVisitId }, takeawayCookie);
  assert.equal(rejectedTakeaway.status, 422); assert.equal((await rejectedTakeaway.json()).error.code, 'NOTES_DISABLED');
  assert.equal((await post('/api/r/salt/takeaway/orders', { ...orderInput(colaId, ''), takeawayVisitId }, takeawayCookie)).status, 200);
  console.log('PASS: product note defaults/legacy reads, management validation/tenant scope, table/takeaway rejection, options preservation, immutable historical notes and committed idempotent retries.');
  return { burgerId, colaId };
}
