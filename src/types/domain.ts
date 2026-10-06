export const languages = ['ar', 'he', 'en'] as const;
export type Language = (typeof languages)[number];
export const orderStatuses = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;
export const serviceTypes = ['WAITER', 'BILL', 'HELP'] as const;
export const serviceStatuses = ['PENDING', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type LocalizedName = { nameAr: string; nameHe: string; nameEn: string };
