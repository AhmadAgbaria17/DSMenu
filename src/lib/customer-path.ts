export function customerApiPath(slug: string, tableNumber: number) {
  return `/api/r/${encodeURIComponent(slug)}/tables/${tableNumber}`;
}
