import type { AnalyticsPreset } from '@/lib/analytics-range';
import type { LocalizedName } from './domain';
export type TimingMetric = { milliseconds: number | null; samples: number };
export type AnalyticsSummary = { orders: number; completedOrders: number; cancelledOrders: number; completedValue: number; averageOrderValue: number | null; orderedTables: number };
export type AnalyticsDto = {
  range: { preset: AnalyticsPreset; timezone: string; start: string; end: string }; generatedAt: string;
  summary: AnalyticsSummary;
  days: { date: string; orders: number; completedValue: number }[];
  hours: { hour: number; orders: number }[];
  products: (LocalizedName & { id: string; quantity: number; completedValue: number })[];
  visits: { total: number; active: number; closed: number; duration: TimingMetric };
  services: { total: number; waiter: number; bill: number; help: number; acknowledge: TimingMetric; resolution: TimingMetric };
  timing: { accept: TimingMetric; prepare: TimingMetric; fulfill: TimingMetric };
  tables: { id: string; number: number | null; visits: number; orders: number; completedValue: number }[];
};
