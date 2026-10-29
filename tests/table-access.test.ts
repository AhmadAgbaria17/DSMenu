import assert from 'node:assert/strict';
import test from 'node:test';
import { tableAccessCode, tableAccessInput } from '../src/lib/table-access';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';

test('table access codes preserve leading zeros and require exactly three ASCII digits', () => {
  for (const code of ['027', '000', '527', '314', '999']) assert.equal(tableAccessCode.parse(code), code);
  for (const code of [27, 527, '', '12', '1234', 'abc', ' 527', '527 ', '٥٢٧', null]) assert.equal(tableAccessCode.safeParse(code).success, false);
});
test('joining pins the request to one visit and rejects client-supplied scope', () => {
  assert.ok(tableAccessInput.safeParse({ action: 'CREATE', code: '527' }).success);
  assert.ok(tableAccessInput.safeParse({ action: 'JOIN', code: '527', sessionId: '123456789012345678901234' }).success);
  for (const input of [{}, { action: 'JOIN', code: '527' }, { action: 'CREATE', code: '527', restaurantId: 'forged' }, { action: 'JOIN', code: '527', sessionId: 'bad' }]) assert.equal(tableAccessInput.safeParse(input).success, false);
});
test('all table gate and staff-code strings exist in Arabic, Hebrew and English', () => {
  for (const messages of [ar, he, en]) {
    assert.deepEqual(Object.keys(messages.TableAccess).sort(), Object.keys(en.TableAccess).sort());
    assert.notEqual(messages.TableAccess.createTitle, messages.TableAccess.joinTitle);
    for (const value of Object.values(messages.TableAccess)) assert.ok(value.trim());
    for (const key of ['TABLE_CODE_REQUIRED', 'TABLE_CODE_INCORRECT', 'TABLE_CODE_LIMIT', 'TABLE_SESSION_STARTED', 'TABLE_SESSION_CHANGED'] as const) assert.ok(messages.Orders.errors[key]);
  }
});
