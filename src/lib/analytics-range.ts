import { z } from 'zod';
export const reportingTimezone = 'Asia/Jerusalem';
export const analyticsPresets = ['today', 'yesterday', '7days', '30days'] as const;
export const analyticsQuery = z.object({ range: z.enum(analyticsPresets).default('today') }).strict();
export type AnalyticsPreset = (typeof analyticsPresets)[number];
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: reportingTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
export function localDateKey(date: Date): string {
  const parts = calendar.formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftCalendarDate(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
// Find the first UTC instant of the local calendar date. Do not subtract fixed
// 24-hour periods: Jerusalem DST produces 23/25-hour reporting days.
export function localDayStart(key: string): Date {
  const center = Date.parse(`${key}T00:00:00Z`);
  let low = center - 36 * 3_600_000; let high = center + 36 * 3_600_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDateKey(new Date(middle)) < key) low = middle + 1; else high = middle;
  }
  return new Date(low);
}
export function analyticsRange(preset: AnalyticsPreset, now = new Date()) {
  const today = localDateKey(now);
  const last = preset === 'yesterday' ? shiftCalendarDate(today, -1) : today;
  const count = preset === '7days' ? 7 : preset === '30days' ? 30 : 1;
  const first = shiftCalendarDate(last, 1 - count);
  return { preset, timezone: reportingTimezone, start: localDayStart(first), end: localDayStart(shiftCalendarDate(last, 1)), days: Array.from({ length: count }, (_, i) => shiftCalendarDate(first, i)) };
}
