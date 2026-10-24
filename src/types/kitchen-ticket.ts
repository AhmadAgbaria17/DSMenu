import type { KitchenUnit, KitchenPrintMetadata } from '@/lib/kitchen-print';

type Name = { nameAr: string; nameHe: string; nameEn: string };
export type KitchenTicket = {
  unit: KitchenUnit;
  restaurantId: string;
  restaurantName: string;
  tableNumber: number | null;
  fulfillmentType: 'TABLE' | 'TAKEAWAY';
  customerName: string | null;
  preparedAt: string;
  print: KitchenPrintMetadata;
  orders: {
    orderNumber: number;
    notes: string;
    items: (Name & { quantity: number; note: string; options: (Name & { selected: Name[]; removed: Name[] })[] })[];
  }[];
};
