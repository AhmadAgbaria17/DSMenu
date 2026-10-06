import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canChangeService, serviceInput, serviceStatusInput, SERVICE_COOLDOWN_MS, unseenServiceCalls } from '../src/lib/service-flow';
import { serviceStatuses } from '../src/types/domain';
test('service transitions allow only forward acknowledgement/resolution', () => {
  for (const from of serviceStatuses) for (const to of serviceStatuses) {
    assert.equal(canChangeService(from, to), (from === 'PENDING' && ['ACKNOWLEDGED', 'RESOLVED'].includes(to)) || (from === 'ACKNOWLEDGED' && to === 'RESOLVED'));
  }
});
test('service inputs reject unknown types, tenant/session overrides and extra fields', () => {
  for (const type of ['WAITER', 'BILL', 'HELP']) assert.ok(serviceInput.safeParse({ type }).success);
  assert.equal(serviceInput.safeParse({ type: 'WAITER', tableSessionId: 'foreign' }).success, false);
  assert.equal(serviceInput.safeParse({ type: 'OTHER' }).success, false);
  assert.equal(serviceStatusInput.safeParse({ expectedStatus: 'PENDING', status: 'RESOLVED', restaurantId: 'foreign' }).success, false);
  assert.equal(SERVICE_COOLDOWN_MS, 30_000);
});
test('service sound baselines, duplicate deliveries and resolved calls remain silent', () => {
  const seen = new Set<string>();
  assert.deepEqual(unseenServiceCalls(seen, [{ id: 'initial', status: 'PENDING' }], true), []);
  assert.deepEqual(unseenServiceCalls(seen, [{ id: 'initial', status: 'PENDING' }, { id: 'new', status: 'PENDING' }], false), ['new']);
  assert.deepEqual(unseenServiceCalls(seen, [{ id: 'new', status: 'PENDING' }], false), []);
  assert.deepEqual(unseenServiceCalls(seen, [{ id: 'offline', status: 'PENDING' }], true), []);
  assert.deepEqual(unseenServiceCalls(seen, [{ id: 'offline', status: 'PENDING' }, { id: 'done', status: 'RESOLVED' }], false), []);
});
