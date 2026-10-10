import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AuthClient, type StaffFixture } from './staff-http';
import { Category, Product, Order, Restaurant } from '../src/models';
import { optionFixture } from './option-fixture';
import { defaultSelections } from '../src/lib/product-options';
import type { CustomerOrder } from '../src/types/orders';
import { createStaffUser } from '../src/lib/staff-users';
export async function runOptionsHttpChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Options HTTP', email: 'options-http@salt.local', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('options-http@salt.local', fixture.password);
  const request = (path: string, body: unknown, method = 'POST') => staff.request(`/api/dashboard/${path}`, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const category = await Category.findOne({ restaurantId: fixture.restaurantId, isActive: true }).orFail();
  const groups = optionFixture(); const data = { nameAr: 'برغر مخصص', nameHe: 'המבורגר מותאם', nameEn: 'Configured Burger', categoryId: String(category._id), descriptionAr: '', descriptionHe: '', descriptionEn: '', price: '48.00', sortOrder: 100, isAvailable: true, isFeatured: false, isArchived: false, optionGroups: groups };
  const created = await request('products', data); assert.equal(created.status, 200); const { id } = await created.json() as { id: string };
  const foreignRestaurant = await Restaurant.findOne({ slug: 'other' }).orFail(); const foreign = await Product.findOne({ restaurantId: foreignRestaurant._id }).orFail();
  assert.equal((await request(`products/${foreign._id}`, data, 'PUT')).status, 404);
  const malformed = structuredClone(data); malformed.optionGroups[0].options[0].priceDelta = 100; assert.equal((await request(`products/${id}`, malformed, 'PUT')).status, 400);
  const post = (path: string, body: unknown, cookie = '') => fetch(`${base}/api/r/salt/tables/7/${path}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const visit = await post('session', {}); assert.equal(visit.status, 200); const cookie = visit.headers.get('set-cookie')!.split(';')[0];
  const selections = defaultSelections(groups); selections[0].optionIds.splice(1, 1); selections[1].optionIds = [groups[1].options[0].id]; selections[2].optionIds = [groups[2].options[1].id];
  const input = { clientRequestId: randomUUID(), items: [{ productId: id, quantity: 2, note: 'No mayo', selections }] };
  const send = (payload: unknown) => post('orders', payload, cookie);
  const foreignGroups = optionFixture(); await Product.updateOne({ _id: foreign._id }, { $set: { optionGroups: foreignGroups } });
  assert.equal((await send({ ...input, items: [{ ...input.items[0], selections: defaultSelections(foreignGroups) }] })).status, 422);
  for (const choices of [undefined, [], [...selections, selections[0]], selections.map(s => ({ ...s, optionIds: [randomUUID()] })), selections.map(s => s.groupId === groups[2].id ? { ...s, optionIds: [] } : s), selections.map(s => s.groupId === groups[2].id ? { ...s, optionIds: groups[2].options.map(o => o.id) } : s), selections.map(s => s.groupId === groups[1].id ? { ...s, optionIds: groups[1].options.map(o => o.id) } : s)]) {
    const response = await send({ ...input, clientRequestId: randomUUID(), items: [{ ...input.items[0], selections: choices }] }); assert.ok([400, 422].includes(response.status));
  }
  const response = await send({ ...input, items: [{ ...input.items[0], price: 1, subtotal: 1, selections: selections.map(s => ({ ...s, priceDelta: -9999 })) }] }); assert.equal(response.status, 200);
  const order = (await response.json() as { order: CustomerOrder }).order; assert.equal(order.subtotal, 10600); assert.equal(order.items[0].price, 5300); assert.equal(order.items[0].basePrice, 4800); assert.equal(order.items[0].optionsTotal, 500); assert.equal(order.items[0].optionGroups![0].removed[0].nameEn, 'Tomato'); assert.equal(order.items[0].optionGroups![1].selected[0].priceDelta, 500);
  const replay = await send({ ...input, items: [{ ...input.items[0], selections: [...selections].reverse().map(s => ({ ...s, optionIds: [...s.optionIds].reverse() })) }] }); assert.equal(replay.status, 200); assert.equal((await replay.json() as { order: CustomerOrder }).order.id, order.id);
  const changed = structuredClone(input); changed.items[0].selections[1].optionIds = []; assert.equal((await send(changed)).status, 409);
  const inactive = structuredClone(data); inactive.optionGroups[1].options[0].isActive = false; assert.equal((await request(`products/${id}`, inactive, 'PUT')).status, 200); assert.equal((await send({ ...input, clientRequestId: randomUUID() })).status, 422);
  inactive.optionGroups[1].options[0].isActive = true; inactive.optionGroups[1].isActive = false; await request(`products/${id}`, inactive, 'PUT'); assert.equal((await send({ ...input, clientRequestId: randomUUID() })).status, 422);
  const updated = structuredClone(data); updated.optionGroups[1].options[0].priceDelta = 600; updated.optionGroups[1].options[0].nameEn = 'Renamed cheese'; assert.equal((await request(`products/${id}`, updated, 'PUT')).status, 200);
  const old = await Order.findById(order.id).orFail(); assert.equal(old.items[0].price, 5300); assert.equal(old.items[0].optionGroups[1].selected[0].nameEn, 'Extra Cheese');
  const current = await send({ ...input, clientRequestId: randomUUID() }); assert.equal(current.status, 200); assert.equal((await current.json() as { order: CustomerOrder }).order.subtotal, 10800);
  const staffOrders = await (await staff.request('/api/dashboard/orders')).json() as { orders: CustomerOrder[] }; assert.equal(staffOrders.orders.find(o => o.id === order.id)!.items[0].optionGroups![1].selected[0].priceDelta, 500);
  const history = await (await fetch(`${base}/api/r/salt/tables/7/orders`, { headers: { cookie } })).json() as { orders: CustomerOrder[] }; assert.equal(history.orders.find(o => o.id === order.id)!.items[0].optionGroups![0].removed[0].nameAr, 'طماطم');
  await request(`products/${id}`, { isAvailable: false }, 'PATCH'); assert.equal((await send({ ...input, clientRequestId: randomUUID() })).status, 422);
  console.log('PASS: options tenant scope, constraints, authoritative prices, integer quantity totals, immutable snapshots, private DTOs, stale selections and canonical idempotency.');
}
