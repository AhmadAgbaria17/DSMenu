import 'server-only';
import { auth } from './auth';
import { customerJson, customerFailure } from './customer-http';
export class StaffApiError extends Error {
  constructor(public code: 'KITCHEN_PRINTING_DISABLED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'INVALID_TRANSITION' | 'CONFLICT' | 'INVALID_REQUEST' | 'FORBIDDEN' | 'TABLE_EXISTS' | 'ACTIVE_VISIT' | 'ACTIVE_ORDERS' | 'UNRESOLVED_CALLS', public status: number) { super(code); }
}
export async function requireStaffApi() {
  const session = await auth();
  if (!session?.user?.id || !session.user.restaurantId || !['OWNER', 'STAFF'].includes(session.user.role)) throw new StaffApiError('UNAUTHORIZED', 401);
  return { ...session.user, restaurantId: session.user.restaurantId };
}
export function staffFailure(error: unknown) {
  return error instanceof StaffApiError ? customerJson({ error: { code: error.code } }, error.status) : customerFailure(error);
}
