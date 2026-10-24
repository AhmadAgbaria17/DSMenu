import { canonicalSelections, selectionsSchema, resolveOptions, type Selection, type OptionSnapshot } from './product-options';
import { z } from 'zod';
import { objectIdSchema, tableNumberSchema } from '@/lib/validators/common';
import type { PublicProduct } from '@/types/menu';

export const MAX_QUANTITY = 99;
export const MAX_NOTE_LENGTH = 300;
export const MAX_CART_LINES = 100;
export const noteSchema = z.string().trim().max(MAX_NOTE_LENGTH);
export type CartScope = { restaurantId: string } & ({ tableNumber: number; takeawayVisitId?: never } | { takeawayVisitId: string; tableNumber?: never });
export type CartItem = { productId: string; quantity: number; note: string; selections?: Selection[] };
export type CartLine = CartItem & { product: PublicProduct; itemTotal: number; unitPrice: number; needsReview: boolean; optionGroups: OptionSnapshot[] };
export type CartState = { items: CartItem[]; hydrated: boolean; lastConfirmedRequestId?: string };
export type CartAction =
  | { type: 'restore'; items: CartItem[]; lastConfirmedRequestId?: string }
  | { type: 'confirmed'; items: CartItem[]; clientRequestId: string }
  | { type: 'add'; productId: string; quantity: number; note: string; selections?: Selection[] }
  | { type: 'quantity'; key: string; quantity: number }
  | { type: 'note'; key: string; note: string }
  | { type: 'remove'; key: string };

export const initialCart: CartState = { items: [], hydrated: false };
const storedItemSchema = z.object({ productId: objectIdSchema, quantity: z.number().finite(), note: z.string(), selections: selectionsSchema.optional() });
const storedCartSchema = z.object({
  version: z.literal(1), restaurantId: objectIdSchema, tableNumber: tableNumberSchema.optional(), takeawayVisitId: objectIdSchema.optional(),
  items: z.array(z.unknown()).max(MAX_CART_LINES),
  lastConfirmedRequestId: z.uuid().optional(),
});

export function cartStorageKey(scope: CartScope) {
  if (scope.takeawayVisitId) return `dsmenu-cart:v1:${objectIdSchema.parse(scope.restaurantId)}:takeaway:${objectIdSchema.parse(scope.takeawayVisitId)}`;
  return `dsmenu-cart:v1:${objectIdSchema.parse(scope.restaurantId)}:${tableNumberSchema.parse(scope.tableNumber)}`;
}
export function cartLineKey(item: Pick<CartItem, 'productId' | 'note' | 'selections'>) {
  return JSON.stringify([item.productId, item.note, ...(item.selections?.length ? [canonicalSelections(item.selections)] : [])]);
}
export function clampQuantity(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(value))) : 1;
}

export function reconcileCart(items: readonly unknown[], products: PublicProduct[]): CartItem[] {
  const available = new Set(products.filter(product => product.isAvailable).map(product => product.id));
  const lines = new Map<string, CartItem>();
  for (const candidate of items.slice(0, MAX_CART_LINES)) {
    const parsed = storedItemSchema.safeParse(candidate);
    if (!parsed.success || !available.has(parsed.data.productId)) continue;
    const item = {
      productId: parsed.data.productId,
      quantity: clampQuantity(parsed.data.quantity),
      note: parsed.data.note.trim().slice(0, MAX_NOTE_LENGTH),
      ...(parsed.data.selections ? { selections: canonicalSelections(parsed.data.selections) } : {}),
    };
    const key = cartLineKey(item);
    const existing = lines.get(key);
    lines.set(key, { ...item, quantity: clampQuantity(item.quantity + (existing?.quantity ?? 0)) });
  }
  return [...lines.values()];
}

export function parseCart(raw: string | null, scope: CartScope, products: PublicProduct[]) {
  if (!raw) return { items: [] as CartItem[], recovered: false };
  try {
    // Bound work on untrusted storage before parsing it.
    if (raw.length > 200_000) return { items: [] as CartItem[], recovered: true };
    const parsed = storedCartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.restaurantId !== scope.restaurantId || parsed.data.tableNumber !== scope.tableNumber || parsed.data.takeawayVisitId !== scope.takeawayVisitId) {
      return { items: [] as CartItem[], recovered: true };
    }
    const items = reconcileCart(parsed.data.items, products);
    return { items, recovered: JSON.stringify(items) !== JSON.stringify(parsed.data.items), ...(parsed.data.lastConfirmedRequestId ? { lastConfirmedRequestId: parsed.data.lastConfirmedRequestId } : {}) };
  } catch { return { items: [] as CartItem[], recovered: true }; }
}

export function serializeCart(items: CartItem[], scope: CartScope, lastConfirmedRequestId?: string) {
  return JSON.stringify({ version: 1, ...scope, items: items.map(({ productId, quantity, note, selections }) => ({ productId, quantity, note, ...(selections ? { selections } : {}) })), ...(lastConfirmedRequestId ? { lastConfirmedRequestId } : {}) });
}

export function cartReducer(state: CartState, action: CartAction, products: PublicProduct[]): CartState {
  const items = reconcileCart(state.items, products);
  switch (action.type) {
    case 'restore': return { items: reconcileCart(action.items, products), hydrated: true, ...(action.lastConfirmedRequestId ? { lastConfirmedRequestId: action.lastConfirmedRequestId } : {}) };
    case 'confirmed': {
      if (state.lastConfirmedRequestId === action.clientRequestId) return state;
      const submitted = new Map(action.items.map(item => [cartLineKey(item), item.quantity]));
      return { ...state, lastConfirmedRequestId: action.clientRequestId, items: items.flatMap(item => {
        const quantity = item.quantity - (submitted.get(cartLineKey(item)) ?? 0);
        return quantity > 0 ? [{ ...item, quantity }] : [];
      }) };
    }
    case 'add': {
      if (!state.hydrated || !noteSchema.safeParse(action.note).success || !Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > MAX_QUANTITY) return state;
      const next = { productId: action.productId, quantity: action.quantity, note: action.note.trim(), ...(action.selections ? { selections: canonicalSelections(action.selections) } : {}) };
      const product = products.find(p => p.id === action.productId);
      try { if (!product || (product.allowCustomerNote === false && next.note)) return state; resolveOptions(product.optionGroups, action.selections); } catch { return state; }
      const key = cartLineKey(next);
      const existing = items.find(item => cartLineKey(item) === key);
      if (!existing && items.length >= MAX_CART_LINES) return state;
      const updated = existing ? items.map(item => cartLineKey(item) === key ? { ...item, quantity: clampQuantity(item.quantity + next.quantity) } : item) : [...items, next];
      return { ...state, items: reconcileCart(updated, products) };
    }
    case 'quantity': return { ...state, items: items.map(item => cartLineKey(item) === action.key ? { ...item, quantity: clampQuantity(action.quantity) } : item) };
    case 'note': {
      const parsed = noteSchema.safeParse(action.note);
      const current = items.find(item => cartLineKey(item) === action.key);
      if (!parsed.success || !current || (parsed.data && products.find(product => product.id === current.productId)?.allowCustomerNote === false)) return state;
      const matching = items.find(item => cartLineKey(item) !== action.key && cartLineKey(item) === cartLineKey({ ...current, note: parsed.data }));
      // Never silently discard quantities when edited notes merge two lines.
      if (matching && matching.quantity + current.quantity > MAX_QUANTITY) return state;
      return { ...state, items: reconcileCart(items.map(item => cartLineKey(item) === action.key ? { ...item, note: parsed.data } : item), products) };
    }
    case 'remove': return { ...state, items: items.filter(item => cartLineKey(item) !== action.key) };
  }
}

// Storage never supplies names, images, currency or prices. The current server DTO wins.
// Phase 3 MUST reload products, verify tenant/availability/quantities, and calculate
// all prices and totals on the server. Neither this cart nor its scope authenticates a visit.
export function getCartSummary(items: CartItem[], products: PublicProduct[]) {
  const catalog = new Map(products.map(product => [product.id, product]));
  const lines: CartLine[] = reconcileCart(items, products).flatMap<CartLine>(item => {
    const product = catalog.get(item.productId);
    if (!product) return [];
    try {
      const options = resolveOptions(product.optionGroups, item.selections);
      const unitPrice = product.price + options.optionsTotal;
      return [{ ...item, product, unitPrice, needsReview: product.allowCustomerNote === false && !!item.note, optionGroups: options.optionGroups, itemTotal: unitPrice * item.quantity }];
    } catch { return [{ ...item, product, unitPrice: product.price, needsReview: true, optionGroups: [], itemTotal: 0 }]; }
  });
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.itemTotal, 0),
  };
}
