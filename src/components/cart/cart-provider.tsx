'use client';

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { cartReducer, cartStorageKey, getCartSummary, initialCart, parseCart, reconcileCart, serializeCart, type CartAction, type CartState } from '@/lib/cart';
import type { PublicProduct } from '@/types/menu';
import { parsePending, pendingStorageKey } from '@/lib/submission';

type CartContextValue = ReturnType<typeof getCartSummary> & {
  ready: boolean;
  canOrder: boolean;
  warning: 'storage' | 'recovered' | null;
  dismissWarning: () => void;
  dispatch: (action: CartAction) => void;
  locked: boolean;
  setLocked: (locked: boolean) => void;
  retainItems: (ids: string[]) => void;
  lastConfirmedRequestId?: string;
};
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ restaurantId, tableNumber, takeawayVisitId, products, children }: {
  restaurantId: string; tableNumber: number | null; takeawayVisitId?: string; products: PublicProduct[]; children: ReactNode;
}) {
  const scope = useMemo(() => takeawayVisitId ? { restaurantId, takeawayVisitId } : tableNumber === null ? null : { restaurantId, tableNumber }, [restaurantId, tableNumber, takeawayVisitId]);
  const key = scope ? cartStorageKey(scope) : null;
  const [retained, setRetained] = useState<PublicProduct[]>([]);
  // Keep failed/pending lines visible even if a later server render changes availability.
  // Additions still validate against the actual menu below, never this display catalog.
  const catalog = [...products.map(product => retained.some(item => item.id === product.id) ? { ...product, isAvailable: true } : product),
    ...retained.filter(item => !products.some(product => product.id === item.id)).map(item => ({ ...item, isAvailable: true }))];
  const [state, dispatch] = useReducer((state: CartState, action: CartAction) => cartReducer(state, action, catalog), initialCart);
  const [locked, setLockedState] = useState(false);
  const lockedRef = useRef(false);
  const setLocked = useCallback((value: boolean) => { lockedRef.current = value; setLockedState(value); }, []);
  const [warning, setWarning] = useState<'storage' | 'recovered' | null>(null);

  // Read the latest catalog without reloading storage on every locale render.
  // That also preserves the in-memory cart when browser storage is blocked.
  const restore = useEffectEvent((raw: string | null) => {
    if (!scope) { dispatch({ type: 'restore', items: [] }); return; }
    const restored = parseCart(raw, scope, catalog);
    dispatch({ type: 'restore', ...restored });
    if (restored.recovered) setWarning('recovered');
  });
  const reconcile = useEffectEvent(() => {
    if (!state.hydrated || lockedRef.current) return;
    const items = reconcileCart(state.items, catalog);
    if (JSON.stringify(items) !== JSON.stringify(state.items)) {
      dispatch({ type: 'restore', items, lastConfirmedRequestId: state.lastConfirmedRequestId });
      setWarning('recovered');
    }
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) reconcile(); });
    return () => { cancelled = true; };
  }, [products]);

  useEffect(() => {
    let cancelled = false;
    // The first server and browser render are both empty. Restore only after mount,
    // and never save that initial empty state over an existing cart.
    queueMicrotask(() => {
      if (cancelled) return;
      if (!key || !scope) { dispatch({ type: 'restore', items: [] }); return; }
      try {
        restore(localStorage.getItem(key));
      } catch {
        dispatch({ type: 'restore', items: [] });
        setWarning('storage');
      }
    });
    function receive(event: StorageEvent) {
      if (!scope || !key || lockedRef.current || (event.key !== key && event.key !== null)) return;
      restore(event.newValue);
    }
    window.addEventListener('storage', receive);
    return () => { cancelled = true; window.removeEventListener('storage', receive); };
  }, [key, scope]);

  useEffect(() => {
    if (!state.hydrated || !scope || !key) return;
    try {
      localStorage.setItem(key, serializeCart(state.items, scope, state.lastConfirmedRequestId));
      // Write the cart receipt before deleting the pending request. A crash between
      // these writes can safely replay the same request without clearing new items.
      const pendingKey = pendingStorageKey(scope);
      const pending = parsePending(localStorage.getItem(pendingKey));
      if (pending && pending.input.clientRequestId === state.lastConfirmedRequestId) localStorage.removeItem(pendingKey);
    }
    catch { queueMicrotask(() => setWarning('storage')); }
  }, [state.hydrated, state.items, state.lastConfirmedRequestId, scope, key]);

  const summary = getCartSummary(state.items, catalog);
  return <CartContext.Provider value={{
    ...summary, ready: state.hydrated, canOrder: scope !== null, warning,
    dismissWarning: () => setWarning(null),
    locked, setLocked, lastConfirmedRequestId: state.lastConfirmedRequestId,
    retainItems: ids => setRetained(summary.lines.filter(line => ids.includes(line.productId)).map(line => line.product)),
    dispatch: action => {
      if (!scope || !state.hydrated || (lockedRef.current && action.type !== 'confirmed')) return;
      if (action.type === 'add' && !products.some(product => product.id === action.productId && product.isAvailable)) return;
      dispatch(action);
    },
  }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart requires CartProvider.');
  return cart;
}
