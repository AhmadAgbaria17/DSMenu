'use client';
import { useTranslations } from 'next-intl';
import { StaffOrderCard } from './order-card';
import type { PreparationGroup } from '@/lib/preparation-groups';
import type { LiveOrder } from '@/types/live-orders';
import type { OrderStatus } from '@/types/orders';
import { KitchenPrintAction } from './kitchen-print-action';

export function PreparationCard({ group, now, pending, update, prepare, kitchenPrintingEnabled }: {
  kitchenPrintingEnabled: boolean; group: PreparationGroup; now: number; pending: boolean;
  update: (order: LiveOrder, status: OrderStatus) => void;
  prepare: (group: PreparationGroup, status: 'PREPARING' | 'READY') => void;
}) {
  const t = useTranslations('LiveOrders');
  const next = group.orders[0].status === 'NEW' ? 'PREPARING' : 'READY';
  if (group.orders.length === 1) return <StaffOrderCard kitchenPrintingEnabled={kitchenPrintingEnabled} order={group.orders[0]} now={now} pending={pending} update={(order, status) => {
    if (group.batchAction && (status === 'PREPARING' || status === 'READY')) prepare(group, status);
    else update(order, status);
  }} />;
  return <section data-testid="preparation-card" className="rounded-2xl border-2 border-emerald-800 bg-emerald-50 p-4">
    <h3 className="mb-4 text-xl font-bold">{t(group.orders[0].status === 'NEW' ? 'newGroup' : 'preparingGroup', { count: group.orders.length })}</h3>
    <div className="space-y-4">{group.orders.map(order => <StaffOrderCard kitchenPrintingEnabled={kitchenPrintingEnabled} key={order.id} order={order} now={now} pending={pending} update={update} hidePrimary />)}</div>
    <div className="mt-4 flex flex-wrap items-end gap-3"><KitchenPrintAction enabled={kitchenPrintingEnabled} order={group.orders[0]} pending={pending} /><button type="button" disabled={pending} onClick={() => prepare(group, next)} className="min-h-14 flex-1 rounded-xl bg-emerald-950 px-5 py-3 font-bold text-white">{pending ? t('updating') : t(next === 'PREPARING' ? 'startGroup' : 'readyGroup')}</button></div>
  </section>;
}
