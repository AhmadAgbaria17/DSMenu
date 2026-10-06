import assert from 'node:assert/strict';
import test from 'node:test';
import { createTableInput, editTableInput, closeTableInput, tableState } from '../src/lib/validators/tables';
import { tableQrUrl } from '../src/lib/qr';
import { appOrigin } from '../src/lib/env';
test('table forms validate bounds, immutable numbers and trusted ownership', () => {
  assert.deepEqual(createTableInput.parse({ tableNumber: 16, label: ' Window ' }), { tableNumber: 16, label: 'Window' });
  for (const tableNumber of [0, -1, 1.5, 10000, '7']) assert.equal(createTableInput.safeParse({ tableNumber }).success, false);
  assert.equal(createTableInput.safeParse({ tableNumber: 7, restaurantId: 'foreign' }).success, false);
  assert.equal(editTableInput.safeParse({ tableNumber: 8, label: '', isActive: true }).success, false);
  assert.equal(editTableInput.safeParse({ label: 'x'.repeat(101), isActive: false }).success, false);
  assert.equal(closeTableInput.safeParse({ sessionId: 'invalid' }).success, false);
  assert.equal(closeTableInput.safeParse({ sessionId: 'a'.repeat(24), restaurantId: 'foreign' }).success, false);
});
test('table state is derived and QR has one canonical format', () => {
  assert.equal(tableState(false, true), 'INACTIVE'); assert.equal(tableState(true, true), 'OCCUPIED'); assert.equal(tableState(true, false), 'AVAILABLE');
  assert.equal(tableQrUrl('https://dsmenu.com', 'salt', 7), 'https://dsmenu.com/r/salt?table=7');
  assert.equal(tableQrUrl('http://localhost:3107', 'salt', 16), 'http://localhost:3107/r/salt?table=16');
});
test('printed QR origin cannot contain credentials, executable schemes or a hidden path', () => {
  const original = process.env.APP_URL;
  try {
    for (const value of ['javascript:alert(1)', 'ftp://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?x=1']) {
      process.env.APP_URL = value; assert.throws(appOrigin, /canonical site origin/);
    }
    process.env.APP_URL = 'https://dsmenu.com/'; assert.equal(appOrigin(), 'https://dsmenu.com');
  } finally { if (original === undefined) delete process.env.APP_URL; else process.env.APP_URL = original; }
});
