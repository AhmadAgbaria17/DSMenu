import 'server-only';
import { Types } from 'mongoose';
import { Order, TableSession, ServiceCall, Table } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { analyticsQuery, analyticsRange } from '@/lib/analytics-range';
import { elapsed, timingGroup, orderFacets, summaryGroup } from '@/lib/analytics-pipelines';
import type { AnalyticsDto, AnalyticsSummary, TimingMetric } from '@/types/analytics';

type RawSummary = Omit<AnalyticsSummary, 'averageOrderValue' | 'orderedTables'>;
type RawTiming = Record<string, number | null>;
type Id = Types.ObjectId;
type OrderResult = {
  summary: RawSummary[]; days: { _id: string; orders: number; completedValue: number }[];
  hours: { _id: number; orders: number }[]; products: { _id: Id; nameAr: string; nameHe: string; nameEn: string; quantity: number; completedValue: number }[];
  tables: { _id: Id; orders: number; completedValue: number }[]; timing: RawTiming[];
};
type VisitResult = { summary: { total: number; active: number; closed: number }[]; timing: RawTiming[]; tables: { _id: Id; visits: number }[] };
type ServiceResult = { counts: { _id: string; count: number }[]; timing: RawTiming[] };
const options = { maxTimeMS: 10_000 };
function timing(row: RawTiming | undefined, field: string): TimingMetric { return { milliseconds: row?.[field] === undefined || row[field] === null ? null : Math.round(row[field]), samples: row?.[`${field}Samples`] ?? 0 }; }
function summary(row?: RawSummary, orderedTables = 0): AnalyticsSummary {
  const values = row ?? { orders: 0, completedOrders: 0, cancelledOrders: 0, completedValue: 0 };
  return { orders: values.orders, completedOrders: values.completedOrders, cancelledOrders: values.cancelledOrders, completedValue: values.completedValue, orderedTables, averageOrderValue: values.completedOrders ? Math.round(values.completedValue / values.completedOrders) : null };
}
async function context(input: unknown) {
  const staff = await requireStaffApi(); const parsed = analyticsQuery.safeParse(input);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const now = new Date(); const range = analyticsRange(parsed.data.range, now);
  // Mongoose does not cast IDs in aggregation pipelines.
  const restaurantId = new Types.ObjectId(staff.restaurantId);
  return { now, range, restaurantId, match: { restaurantId, createdAt: { $gte: range.start, $lt: new Date(Math.min(range.end.getTime(), now.getTime() + 1)) } } };
}
export async function getTodayOrderSummary(): Promise<AnalyticsSummary> {
  const { match } = await context({ range: 'today' });
  const rows = await Order.aggregate<RawSummary>([{ $match: match }, { $group: summaryGroup }]).option(options);
  return summary(rows[0]);
}
export async function getAnalytics(input: unknown): Promise<AnalyticsDto> {
  const { now, range, restaurantId, match } = await context(input);
  const [orderRows, visitRows, serviceRows] = await Promise.all([
    Order.aggregate<OrderResult>([{ $match: match }, { $facet: orderFacets(now) }]).option(options),
    TableSession.aggregate<VisitResult>([{ $match: match }, { $facet: {
      summary: [{ $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } }, closed: { $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] } } } }],
      timing: [{ $match: { status: 'CLOSED' } }, { $project: { duration: elapsed('createdAt', 'closedAt', now) } }, { $group: timingGroup(['duration']) }],
      tables: [{ $group: { _id: '$tableId', visits: { $sum: 1 } } }],
    } }]).option(options),
    ServiceCall.aggregate<ServiceResult>([{ $match: match }, { $facet: {
      counts: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
      timing: [{ $project: { acknowledge: elapsed('createdAt', 'acknowledgedAt', now), resolution: elapsed('createdAt', 'resolvedAt', now) } }, { $group: timingGroup(['acknowledge', 'resolution']) }],
    } }]).option(options),
  ]);
  const orders = orderRows[0]; const visits = visitRows[0]; const services = serviceRows[0];
  const activity = new Map<string, AnalyticsDto['tables'][number]>();
  for (const row of visits.tables) activity.set(String(row._id), { id: String(row._id), number: null, visits: row.visits, orders: 0, completedValue: 0 });
  for (const row of orders.tables) { const id = String(row._id); activity.set(id, { id, number: null, visits: activity.get(id)?.visits ?? 0, orders: row.orders, completedValue: row.completedValue }); }
  const tableMetrics = [...activity.values()].sort((a, b) => b.orders - a.orders || b.visits - a.visits || a.id.localeCompare(b.id)).slice(0, 50);
  const tables = await Table.find({ restaurantId, _id: { $in: tableMetrics.map(row => row.id) } }).select('_id tableNumber').maxTimeMS(10_000).lean();
  const numbers = new Map(tables.map(table => [String(table._id), table.tableNumber]));
  const byDay = new Map(orders.days.map(row => [row._id, row])); const byHour = new Map(orders.hours.map(row => [row._id, row.orders]));
  const byType = new Map(services.counts.map(row => [row._id, row.count])); const visitSummary = visits.summary[0];
  return {
    range: { preset: range.preset, timezone: range.timezone, start: range.start.toISOString(), end: range.end.toISOString() }, generatedAt: now.toISOString(),
    summary: summary(orders.summary[0], orders.tables.length),
    days: range.days.map(date => ({ date, orders: byDay.get(date)?.orders ?? 0, completedValue: byDay.get(date)?.completedValue ?? 0 })),
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: byHour.get(hour) ?? 0 })),
    products: orders.products.map(row => ({ id: String(row._id), nameAr: row.nameAr, nameHe: row.nameHe, nameEn: row.nameEn, quantity: row.quantity, completedValue: row.completedValue })),
    visits: { total: visitSummary?.total ?? 0, active: visitSummary?.active ?? 0, closed: visitSummary?.closed ?? 0, duration: timing(visits.timing[0], 'duration') },
    services: { total: services.counts.reduce((sum, row) => sum + row.count, 0), waiter: byType.get('WAITER') ?? 0, bill: byType.get('BILL') ?? 0, help: byType.get('HELP') ?? 0, acknowledge: timing(services.timing[0], 'acknowledge'), resolution: timing(services.timing[0], 'resolution') },
    timing: { accept: timing(orders.timing[0], 'accept'), prepare: timing(orders.timing[0], 'prepare'), fulfill: timing(orders.timing[0], 'fulfill') },
    tables: tableMetrics.map(row => ({ ...row, number: numbers.get(row.id) ?? null })),
  };
}
