'use client';

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { useCart } from '@/components/cart/cart-provider';
import { customerApiPath, takeawayApiPath } from '@/lib/customer-path';
import { parsePending, pendingStorageKey, type PendingSubmission } from '@/lib/submission';
import { customerErrorCodes, type CustomerError, type CustomerOrder, type OrdersResponse } from '@/types/orders';
import type { CartScope } from '@/lib/cart';
import { z } from 'zod';
import { useOrderRealtime } from '@/hooks/use-order-realtime';
import type { ConnectionState, RealtimeConfig } from '@/types/live-orders';

const errorEnvelope = z.object({ error: z.object({ code: z.enum(customerErrorCodes), itemIds: z.array(z.string()).optional() }) });

class ApiFailure extends Error {
  constructor(public detail: CustomerError, public uncertain: boolean) { super(detail.code); }
}
async function callApi<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  } catch { throw new ApiFailure({ code: 'NETWORK_ERROR' }, true); }
  let data: unknown;
  try { data = await response.json(); } catch { throw new ApiFailure({ code: 'NETWORK_ERROR' }, true); }
  if (!response.ok) {
    const parsed = errorEnvelope.safeParse(data);
    throw new ApiFailure(parsed.success ? parsed.data.error : { code: 'SERVICE_UNAVAILABLE' }, response.status >= 500);
  }
  return data as T;
}
type OrdersContextValue = {
  serviceRevision: number; apiPath: string | null; ready: boolean; connecting: boolean; busy: boolean; uncertain: boolean;
  realtimeState: ConnectionState;
  orders: CustomerOrder[]; confirmed: CustomerOrder | null; error: CustomerError | null;
  connect: () => Promise<void>; refresh: () => Promise<void>; send: () => Promise<void>; discardPending: () => void;
};
const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ slug, restaurantId, tableNumber, takeawayVisitId, children }: {
  slug: string; restaurantId: string; tableNumber: number | null; takeawayVisitId?: string; children: ReactNode;
}) {
  const cart = useCart();
  const path = takeawayVisitId ? takeawayApiPath(slug) : tableNumber === null ? null : customerApiPath(slug, tableNumber);
  const scope: CartScope | null = takeawayVisitId ? { restaurantId, takeawayVisitId } : tableNumber === null ? null : { restaurantId, tableNumber };
  const [serviceRevision, setServiceRevision] = useState(0);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [realtime, setRealtime] = useState<RealtimeConfig | null>(null);
  const historySequence = useRef(0);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmed, setConfirmed] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<CustomerError | null>(null);
  const pending = useRef<PendingSubmission | null>(null);
  const sending = useRef(false);
  const connection = useRef<Promise<void> | null>(null);

  const connect = useCallback(async () => {
    if (!path) return;
    if (connection.current) return connection.current;
    const operation = async () => {
      setConnecting(true);
      try {
        // Establish only on entry or explicit retry, never as part of Send Order.
        const visit = await callApi<{ visitId: string }>(`${path}/session`, takeawayVisitId ? undefined : {});
        const history = await callApi<OrdersResponse>(`${path}/orders`);
        if (takeawayVisitId && visit.visitId !== takeawayVisitId) throw new ApiFailure({ code: 'VISIT_CHANGED' }, false);
        if (visit.visitId !== history.visitId) throw new ApiFailure({ code: 'SESSION_CLOSED' }, false);
        setVisitId(visit.visitId); setOrders(history.orders); setError(null);
        setRealtime(history.realtime ?? null);
      } catch (failure) { setVisitId(null); setError(failure instanceof ApiFailure ? failure.detail : { code: 'NETWORK_ERROR' }); }
      finally { setConnecting(false); connection.current = null; }
    };
    connection.current = operation();
    return connection.current;
  }, [path, takeawayVisitId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void connect(); });
    return () => { cancelled = true; };
  }, [connect]);

  const restorePending = useEffectEvent(() => {
    if (!scope || !cart.ready || !visitId || pending.current) return;
    try {
      const saved = parsePending(localStorage.getItem(pendingStorageKey(scope)));
      if (!saved || saved.input.clientRequestId === cart.lastConfirmedRequestId) return;
      pending.current = saved;
      cart.retainItems(saved.input.items.map(item => item.productId));
      cart.setLocked(true); setUncertain(true);
      setError({ code: saved.visitId === visitId ? 'NETWORK_ERROR' : 'VISIT_CHANGED' });
    } catch { /* In-memory retries remain possible when storage is blocked. */ }
  });
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) restorePending(); });
    return () => { cancelled = true; };
  }, [cart.ready, visitId]);

  async function refresh(automatic = false) {
    if (!path || sending.current) return;
    const sequence = ++historySequence.current;
    if (!automatic) setConnecting(true);
    try {
      const history = await callApi<OrdersResponse>(`${path}/orders`);
      if (sequence !== historySequence.current || sending.current) return;
      if (history.visitId !== visitId) { setRealtime(null); return; }
      setOrders(history.orders); setRealtime(history.realtime ?? null);
      setConfirmed(previous => previous ? history.orders.find(order => order.id === previous.id) ?? previous : null);
      if (!automatic) setError(null);
    }
    catch (failure) {
      if (sequence !== historySequence.current) return;
      if (failure instanceof ApiFailure && ['SESSION_CLOSED', 'SESSION_REQUIRED'].includes(failure.detail.code)) setRealtime(null);
      if (!automatic) setError(failure instanceof ApiFailure ? failure.detail : { code: 'NETWORK_ERROR' });
    }
    finally { if (!automatic) setConnecting(false); }
  }
  const realtimeState = useOrderRealtime(realtime, visitId && path ? `${path}/realtime` : null, () => { setServiceRevision(value => value + 1); void refresh(true); });

  async function send() {
    if (!path || !scope || !visitId || sending.current || !cart.ready) return;
    let attempt = pending.current;
    if (attempt && attempt.visitId !== visitId) { setError({ code: 'VISIT_CHANGED' }); return; }
    if (!attempt) {
      if (!cart.lines.length || cart.lines.some(line => line.needsReview)) return;
      attempt = { version: 1, visitId, input: { clientRequestId: crypto.randomUUID(), items: cart.lines.map(({ productId, quantity, note, selections }) => ({ productId, quantity, note, ...(selections ? { selections } : {}) })) } };
      pending.current = attempt;
      try { localStorage.setItem(pendingStorageKey(scope), JSON.stringify(attempt)); } catch { /* Cart already warns when persistence is unavailable. */ }
    }
    sending.current = true; historySequence.current++; setBusy(true); setError(null); setConfirmed(null);
    cart.retainItems(attempt.input.items.map(item => item.productId)); cart.setLocked(true);
    try {
      const result = await callApi<{ order: CustomerOrder }>(`${path}/orders`, takeawayVisitId ? { ...attempt.input, takeawayVisitId } : attempt.input);
      cart.dispatch({ type: 'confirmed', items: attempt.input.items, clientRequestId: attempt.input.clientRequestId });
      setConfirmed(result.order);
      setOrders(previous => [result.order, ...previous.filter(order => order.id !== result.order.id)].sort((a, b) => b.orderNumber - a.orderNumber));
      pending.current = null; setUncertain(false); cart.setLocked(false); cart.retainItems([]);
      // CartProvider persists the receipt before removing the durable pending request.
    } catch (failure) {
      const issue = failure instanceof ApiFailure ? failure : new ApiFailure({ code: 'NETWORK_ERROR' }, true);
      setError(issue.detail); setUncertain(issue.uncertain);
      if (!issue.uncertain) {
        pending.current = null;
        try { localStorage.removeItem(pendingStorageKey(scope)); } catch { /* Memory state still works. */ }
        cart.setLocked(false);
      }
    } finally { sending.current = false; setBusy(false); }
  }

  function discardPending() {
    if (sending.current) return;
    pending.current = null; setUncertain(false); cart.setLocked(false); setError(null);
    if (scope) { try { localStorage.removeItem(pendingStorageKey(scope)); } catch { /* In-memory reset. */ } }
  }
  return <OrdersContext.Provider value={{ serviceRevision, apiPath: path, ready: visitId !== null, connecting, busy, uncertain, realtimeState, orders, confirmed, error, connect, refresh, send, discardPending }}>{children}</OrdersContext.Provider>;
}
export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders requires OrdersProvider.');
  return context;
}
