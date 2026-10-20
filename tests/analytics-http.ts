import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { AuthClient, type StaffFixture } from './staff-http';
import { createStaffUser } from '../src/lib/staff-users';
import { Restaurant, Table, TableSession, Order, ServiceCall, Product, Category } from '../src/models';
import { analyticsRange, localDateKey } from '../src/lib/analytics-range';
import type { AnalyticsDto } from '../src/types/analytics';
export type AnalyticsFixture = { email: string; password: string; restaurantId: string; date: string };
export async function runAnalyticsHttpChecks(base: string, staffFixture: StaffFixture): Promise<AnalyticsFixture> {
  const restaurant = await Restaurant.create({ name: 'Analytics Lab', slug: 'analytics-lab' });
  const email = 'analytics@lab.local'; const password = staffFixture.password;
  await createStaffUser({ restaurant: 'analytics-lab', name: 'Analytics Owner', email, password, role: 'OWNER' });
  const staff = new AuthClient(base); await staff.login(email, password);
  const [table, table2] = await Table.create([{ restaurantId: restaurant._id, tableNumber: 1 }, { restaurantId: restaurant._id, tableNumber: 2 }]);
  const category = await Category.create({ restaurantId: restaurant._id, nameAr: 'اختبار', nameHe: 'בדיקה', nameEn: 'Test' });
  const product = await Product.create({ restaurantId: restaurant._id, categoryId: category._id, nameAr: 'منتج', nameHe: 'מוצר', nameEn: 'Current Expensive Burger', price: 5500 });
  const deletedProduct = await Product.create({ restaurantId: restaurant._id, categoryId: category._id, nameAr: 'منتج قديم', nameHe: 'מוצר ישן', nameEn: 'Deleted Later', price: 9999 });
  const now = new Date(); const yesterday = analyticsRange('yesterday', now); const week = analyticsRange('7days', now);
  const stamp = (minutes: number) => new Date(yesterday.start.getTime() + minutes * 60_000);
  const older = new Date(week.start.getTime() + 60_000);
  const scope = { restaurantId: restaurant._id, tableId: table._id };
  const visits = await TableSession.create([
    { ...scope, status: 'CLOSED', createdAt: stamp(0), closedAt: stamp(60) },
    { ...scope, tableId: table2._id, status: 'ACTIVE', createdAt: stamp(10) },
    { ...scope, status: 'CLOSED', createdAt: stamp(10), closedAt: stamp(5) },
    { ...scope, status: 'CLOSED', createdAt: older, closedAt: new Date(older.getTime() + 120_000) },
  ]);
  let sequence = 0;
  const makeOrder = async (status: 'SERVED' | 'READY' | 'CANCELLED', price: number, quantity: number, productId: Types.ObjectId, date: Date, timestamps: Record<string, Date> = {}, tableId = table._id) => Order.create({ ...scope, tableId, tableSessionId: visits[0]._id, orderNumber: ++sequence, idempotencyKey: randomUUID(), status, subtotal: price * quantity, createdAt: date, ...timestamps, notes: 'PRIVATE NOTE DO NOT EXPOSE', items: [{ productId, nameAr: productId.equals(product._id) ? 'برغر تاريخي' : 'منتج محذوف', nameHe: productId.equals(product._id) ? 'המבורגר היסטורי' : 'מוצר שנמחק', nameEn: productId.equals(product._id) ? 'Historical Burger' : 'Historical Dessert', price, quantity, itemTotal: price * quantity, notes: 'PRIVATE ITEM NOTE' }] });
  await makeOrder('SERVED', 4800, 2, product._id, stamp(10), { acceptedAt: stamp(12), preparingAt: stamp(15), readyAt: stamp(25), servedAt: stamp(30) });
  await makeOrder('SERVED', 550, 1, deletedProduct._id, stamp(20), { acceptedAt: stamp(24), preparingAt: stamp(25), readyAt: stamp(45), servedAt: stamp(60) });
  await makeOrder('SERVED', 1990, 1, deletedProduct._id, stamp(30));
  await makeOrder('READY', 4800, 1, product._id, stamp(40), { acceptedAt: stamp(35), preparingAt: stamp(50), readyAt: stamp(45) });
  await makeOrder('CANCELLED', 4800, 2, product._id, stamp(50), { acceptedAt: stamp(51), preparingAt: stamp(52), readyAt: stamp(53) });
  await makeOrder('SERVED', 1000, 1, deletedProduct._id, older, {}, table2._id);
  // Both historical IDs survive changes/removal in the live catalog.
  await Product.deleteOne({ _id: deletedProduct._id });
  await Product.updateOne({ _id: product._id }, { $set: { price: 99900, isArchived: true } });
  await ServiceCall.create([
    { ...scope, tableSessionId: visits[0]._id, type: 'WAITER', status: 'RESOLVED', createdAt: stamp(10), acknowledgedAt: stamp(11), resolvedAt: stamp(13) },
    { ...scope, tableSessionId: visits[0]._id, type: 'BILL', status: 'RESOLVED', createdAt: stamp(20), acknowledgedAt: stamp(23), resolvedAt: stamp(25) },
    { ...scope, tableSessionId: visits[0]._id, type: 'HELP', status: 'PENDING', createdAt: stamp(30), acknowledgedAt: stamp(20), resolvedAt: new Date(now.getTime() + 86_400_000) },
  ]);
  const get = async (range: string) => { const response = await staff.request(`/api/dashboard/analytics?range=${range}`); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/); return await response.json() as AnalyticsDto; };
  assert.equal((await fetch(`${base}/api/dashboard/analytics`)).status, 401);
  assert.equal((await staff.request(`/api/dashboard/analytics?restaurantId=${staffFixture.restaurantId}`)).status, 400);
  assert.equal((await staff.request('/api/dashboard/analytics?range=all')).status, 400);
  assert.equal((await staff.request('/api/dashboard/analytics?range=today&range=yesterday')).status, 400);
  const data = await get('yesterday');
  assert.deepEqual(data.summary, { orders: 4, completedOrders: 4, cancelledOrders: 1, completedValue: 16940, averageOrderValue: 4235, orderedTables: 1 });
  assert.equal(data.products[0].nameEn, 'Historical Burger'); assert.equal(data.products[0].quantity, 3); assert.equal(data.products[0].completedValue, 14400);
  assert.equal(data.products.find(p => p.id === String(deletedProduct._id))?.completedValue, 2540);
  assert.deepEqual(data.days, [{ date: yesterday.days[0], orders: 4, completedValue: 16940 }]); assert.equal(data.hours[0].orders, 4); assert.equal(data.hours.reduce((n, h) => n + h.orders, 0), 4);
  assert.deepEqual(data.timing.accept, { milliseconds: 180000, samples: 2 }); assert.deepEqual(data.timing.prepare, { milliseconds: 900000, samples: 2 }); assert.deepEqual(data.timing.fulfill, { milliseconds: 1300000, samples: 3 });
  assert.deepEqual(data.visits, { total: 3, active: 1, closed: 2, duration: { milliseconds: 3600000, samples: 1 } });
  assert.deepEqual(data.services, { total: 3, waiter: 1, bill: 1, help: 1, acknowledge: { milliseconds: 120000, samples: 2 }, resolution: { milliseconds: 240000, samples: 2 } });
  assert.equal(data.tables.find(t => t.number === 1)?.orders, 4); assert.equal(data.tables.find(t => t.number === 2)?.visits, 1);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|password|credentials|token|email|phone|Current Expensive Burger|TenantSecret/);
  const today = await get('today'); assert.equal(today.summary.orders, 0); assert.equal(today.summary.averageOrderValue, null); assert.equal(today.timing.prepare.milliseconds, null);
  const seven = await get('7days'); assert.equal(seven.days.length, 7); assert.equal(seven.summary.orders, 5); assert.equal(seven.summary.completedValue, 17940); assert.equal(seven.visits.total, 4); assert.equal(seven.summary.orderedTables, 2);
  assert.equal((await get('30days')).days.length, 30);
  const before = await makeOrder('SERVED', 100, 1, product._id, new Date(yesterday.start.getTime() - 1));
  const atEnd = await makeOrder('SERVED', 200, 1, product._id, yesterday.end);
  assert.equal((await get('yesterday')).summary.completedValue, 16940, 'neither instant outside the half-open range leaks into yesterday');
  assert.equal((await get('today')).summary.completedValue, 200, 'local midnight belongs to today');
  assert.equal((await get('today')).summary.orders, 1);
  await Order.deleteMany({ _id: { $in: [before._id, atEnd._id] }, restaurantId: restaurant._id });
  const salt = new AuthClient(base); await salt.login(staffFixture.email, password); const saltData = await (await salt.request('/api/dashboard/analytics?range=30days')).json() as AnalyticsDto;
  assert.equal(saltData.products.some(p => p.id === String(product._id) || p.id === String(deletedProduct._id)), false);
  for (const model of [Order, TableSession, ServiceCall]) {
    const indexes = await model.collection.indexes(); assert.ok(indexes.some(index => index.key.restaurantId === 1 && index.key.createdAt === -1 && Object.keys(index.key).length === 2));
    await model.createIndexes(); // additive, rerunnable; unique session/order indexes remain.
  }
  assert.ok((await Order.collection.indexes()).some(index => index.unique && index.key.idempotencyKey === 1));
  console.log('PASS: analytics private scope, presets, Jerusalem midnight/hour grouping, ready and legacy served snapshot value, cancellations, rounding, deleted products, valid timings, visits, service breakdown, privacy and additive indexes.');
  return { email, password, restaurantId: String(restaurant._id), date: localDateKey(stamp(10)) };
}
