export type ManagedTable = {
  id: string; tableNumber: number; label: string; isActive: boolean;
  state: 'AVAILABLE' | 'OCCUPIED' | 'INACTIVE'; qrUrl: string;
  visit: { id: string; openedAt: string; activeOrders: number; unresolvedCalls: number } | null;
};
export type TableSnapshot = { restaurant: { name: string; slug: string; logo: string | null }; tables: ManagedTable[] };
