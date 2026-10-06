import type { CustomerErrorCode } from '@/types/orders';

export class CustomerRequestError extends Error {
  constructor(public code: CustomerErrorCode, public status = 400, public itemIds?: string[]) { super(code); }
}
export function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
