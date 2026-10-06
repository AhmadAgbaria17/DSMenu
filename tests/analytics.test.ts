import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsRange, analyticsQuery, localDateKey, localDayStart } from '../src/lib/analytics-range';
test('analytics presets use local Jerusalem calendar dates, inclusive start/exclusive end', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const today = analyticsRange('today', now); assert.equal(today.start.toISOString(), '2026-10-04T21:00:00.000Z'); assert.equal(today.end.toISOString(), '2026-10-05T21:00:00.000Z');
  const yesterday = analyticsRange('yesterday', now); assert.deepEqual(yesterday.days, ['2026-10-04']); assert.equal(yesterday.end.getTime(), today.start.getTime());
  assert.deepEqual(analyticsRange('7days', now).days, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  const month = analyticsRange('30days', now); assert.equal(month.days.length, 30); assert.equal(month.days[0], '2026-09-06');
  assert.equal(localDateKey(new Date('2026-10-04T22:00:00Z')), '2026-10-05');
});
test('reporting boundaries handle short and long DST days without shifting stored timestamps', () => {
  assert.equal((localDayStart('2026-03-28').getTime() - localDayStart('2026-03-27').getTime()) / 3_600_000, 23);
  assert.equal((localDayStart('2026-10-26').getTime() - localDayStart('2026-10-25').getTime()) / 3_600_000, 25);
});
test('analytics query accepts only bounded presets and rejects ownership overrides', () => {
  assert.deepEqual(analyticsQuery.parse({}), { range: 'today' });
  for (const input of [{ range: 'all' }, { range: ['today', 'yesterday'] }, { range: 'today', restaurantId: 'a'.repeat(24) }, { start: '2000-01-01' }]) assert.equal(analyticsQuery.safeParse(input).success, false);
});
