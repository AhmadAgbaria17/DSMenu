import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canTransition, unseenNewOrders, statusChangeSchema, activeOrderStatuses, unfinishedOrderStatuses, operationalStatus, completedOrderStatuses } from '../src/lib/order-flow';
import { orderStatuses } from '../src/types/domain';
import { realtimeAuthSchema, restaurantChannel, visitChannel } from '../src/lib/realtime-channels';

test('only explicit forward transitions and early cancellation are allowed', () => {
  const allowed = new Set(['NEW:PREPARING', 'NEW:CANCELLED', 'ACCEPTED:READY', 'ACCEPTED:CANCELLED', 'PREPARING:READY']);
  for (const from of orderStatuses) for (const to of orderStatuses) assert.equal(canTransition(from, to), allowed.has(`${from}:${to}`));
  assert.equal(statusChangeSchema.safeParse({ expectedStatus: 'NEW', status: 'fake' }).success, false);
});
test('ready is completed, while legacy accepted remains unfinished preparation', () => {
  assert.deepEqual(activeOrderStatuses, ['NEW', 'PREPARING']);
  assert.deepEqual(completedOrderStatuses, ['READY', 'SERVED']);
  assert.equal(operationalStatus('ACCEPTED'), 'PREPARING');
  assert.ok(unfinishedOrderStatuses.includes('ACCEPTED'));
  assert.deepEqual(unseenNewOrders(new Set(), [{ id: 'ready', status: 'READY' }], false), []);
});
test('sound dedupe suppresses known orders, rerenders, completed orders and reconnect baselines', () => {
  const seen = new Set<string>();
  assert.deepEqual(unseenNewOrders(seen, [{ id: 'a', status: 'NEW' }], true), []);
  assert.deepEqual(unseenNewOrders(seen, [{ id: 'a', status: 'NEW' }, { id: 'b', status: 'NEW' }], false), ['b']);
  assert.deepEqual(unseenNewOrders(seen, [{ id: 'b', status: 'NEW' }], false), []);
  assert.deepEqual(unseenNewOrders(seen, [{ id: 'c', status: 'NEW' }, { id: 'd', status: 'SERVED' }], true), []);
  assert.deepEqual(unseenNewOrders(seen, [{ id: 'c', status: 'NEW' }, { id: 'd', status: 'SERVED' }], false), []);
});
test('realtime channel shapes and socket inputs are bounded', () => {
  const id = '000000000000000000000001';
  assert.notEqual(restaurantChannel(id), visitChannel(id));
  assert.throws(() => restaurantChannel('injected-channel'));
  assert.equal(realtimeAuthSchema.safeParse({ socket_id: '1.2', channel_name: visitChannel(id) }).success, true);
  assert.equal(realtimeAuthSchema.safeParse({ socket_id: '1:evil', channel_name: 'x' }).success, false);
});
