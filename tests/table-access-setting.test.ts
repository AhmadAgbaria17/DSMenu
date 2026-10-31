import test from 'node:test';
import assert from 'node:assert/strict';
import { Restaurant, TableSession } from '../src/models';
import { tableAccessInput } from '../src/lib/table-access';
import { restaurantInput } from '../src/lib/validators/menu-management';

test('restaurant and session access policy default to protected, with an immutable visit snapshot', () => {
  assert.equal(new Restaurant({ name: 'Salt', slug: 'salt' }).tableAccessCodeEnabled, true);
  assert.equal(new TableSession().accessCodeRequired, true);
  assert.equal(TableSession.schema.path('accessCodeRequired').options.immutable, true);
});
test('OPEN requires explicit session intent and rejects policy overrides or fake codes', () => {
  assert.ok(tableAccessInput.safeParse({ action: 'OPEN', sessionId: null }).success);
  assert.ok(tableAccessInput.safeParse({ action: 'OPEN', sessionId: '123456789012345678901234' }).success);
  for (const input of [{ action: 'OPEN' }, { action: 'OPEN', sessionId: null, code: '000' }, { action: 'OPEN', sessionId: null, accessCodeRequired: false }]) assert.equal(tableAccessInput.safeParse(input).success, false);
});
test('settings accept only boolean access preferences and omission does not reset them', () => {
  const field = restaurantInput.shape.tableAccessCodeEnabled;
  assert.equal(field.parse(false), false); assert.equal(field.parse(true), true); assert.equal(field.parse(undefined), undefined);
  for (const value of ['false', 0, null]) assert.equal(field.safeParse(value).success, false);
});
