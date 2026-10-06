import type { PipelineStage } from 'mongoose';
import { reportingTimezone } from './analytics-range';
export const completedValue = { $cond: [{ $eq: ['$status', 'SERVED'] }, '$subtotal', 0] };
export const nonCancelledCount = { $cond: [{ $ne: ['$status', 'CANCELLED'] }, 1, 0] };
export const summaryGroup = { _id: null, orders: { $sum: nonCancelledCount }, completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'SERVED'] }, 1, 0] } }, cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } }, completedValue: { $sum: completedValue } };
export function elapsed(start: string, end: string, now: Date) {
  return { $cond: [{ $and: [{ $eq: [{ $type: `$${start}` }, 'date'] }, { $eq: [{ $type: `$${end}` }, 'date'] }, { $gte: [`$${end}`, `$${start}`] }, { $lte: [`$${end}`, now] }] }, { $subtract: [`$${end}`, `$${start}`] }, null] };
}
export function timingGroup(fields: string[]): PipelineStage.Group['$group'] {
  const group: Record<string, unknown> & { _id: null } = { _id: null };
  for (const field of fields) {
    group[field] = { $avg: `$${field}` };
    group[`${field}Samples`] = { $sum: { $cond: [{ $ne: [`$${field}`, null] }, 1, 0] } };
  }
  return group;
}
export function orderFacets(now: Date): PipelineStage.Facet['$facet'] {
  return {
    summary: [{ $group: summaryGroup }],
    days: [{ $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: reportingTimezone } }, orders: { $sum: nonCancelledCount }, completedValue: { $sum: completedValue } } }],
    hours: [{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: { $hour: { date: '$createdAt', timezone: reportingTimezone } }, orders: { $sum: 1 } } }],
    products: [{ $match: { status: 'SERVED' } }, { $sort: { createdAt: -1, _id: -1 } }, { $unwind: '$items' }, { $group: { _id: '$items.productId', nameAr: { $first: '$items.nameAr' }, nameHe: { $first: '$items.nameHe' }, nameEn: { $first: '$items.nameEn' }, quantity: { $sum: '$items.quantity' }, completedValue: { $sum: '$items.itemTotal' } } }, { $sort: { quantity: -1, completedValue: -1, _id: 1 } }, { $limit: 10 }],
    tables: [{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$tableId', orders: { $sum: 1 }, completedValue: { $sum: completedValue } } }],
    timing: [{ $match: { status: { $ne: 'CANCELLED' } } }, { $project: { accept: elapsed('createdAt', 'acceptedAt', now), prepare: elapsed('preparingAt', 'readyAt', now), fulfill: { $cond: [{ $eq: ['$status', 'SERVED'] }, elapsed('createdAt', 'servedAt', now), null] } } }, { $group: timingGroup(['accept', 'prepare', 'fulfill']) }],
  };
}
