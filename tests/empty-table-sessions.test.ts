import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_TABLE_SESSION_TIMEOUT_MINUTES, emptySessionFilter } from '../src/lib/empty-table-sessions';
import { TableSession, ServiceCall } from '../src/models';

test('empty visit policy uses a full 120 minutes and requires both creation/activity cutoffs', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');
  const filter = emptySessionFilter(now);
  assert.equal(EMPTY_TABLE_SESSION_TIMEOUT_MINUTES, 120);
  assert.equal(filter.createdAt.$lte.toISOString(), '2026-10-25T10:00:00.000Z');
  assert.equal(filter.$or[0].lastActivityAt?.$lte.getTime(), filter.createdAt.$lte.getTime());
  assert.equal(new Date('2026-10-25T10:00:00.001Z') <= filter.createdAt.$lte, false);
  assert.equal(new Date('2026-10-25T10:00:00.000Z') <= filter.createdAt.$lte, true);
  assert.equal(filter.status, 'ACTIVE');
  assert.deepEqual(filter.nextOrderNumber.$in, [0, null]);
});

test('cleanup indexes and close reason are declared without TTL/history deletion', () => {
  assert.ok(TableSession.schema.indexes().some(([, options]) => options.name === 'empty_session_cleanup'));
  assert.ok(ServiceCall.schema.indexes().some(([, options]) => options.name === 'session_unresolved_calls'));
  assert.ok(TableSession.schema.path('closeReason'));
  assert.ok(TableSession.schema.indexes().every(([, options]) => options.expireAfterSeconds === undefined));
});
