import 'server-only';
import { auth } from './auth';
import { customerJson, customerFailure } from './customer-http';
export class StaffApiError extends Error {
  constructor(public code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'INVALID_TRANSITION' | 'CONFLICT' | 'INVALID_REQUEST' | 'FORBIDDEN' | 'TABLE_EXISTS' | 'ACTIVE_VISIT' | 'ACTIVE_ORDERS' | 'UNRESOLVED_CALLS', public status: number) { super(code); }
}
export async function requireStaffApi() {
  const session = await auth();
  if (!session?.user?.id || !session.user.restaurantId) throw new StaffApiError('UNAUTHORIZED', 401);
  return session.user;
}
export function staffFailure(error: unknown) {
  return error instanceof StaffApiError ? customerJson({ error: { code: error.code } }, error.status) : customerFailure(error);
}
