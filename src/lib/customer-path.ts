export function customerApiPath(slug: string, tableNumber: number) {
  return `/api/r/${encodeURIComponent(slug)}/tables/${tableNumber}`;
}

export const takeawayApiPath = (slug: string) => `/api/r/${encodeURIComponent(slug)}/takeaway`;
