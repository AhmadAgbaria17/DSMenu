import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { customerJson, customerFailure } from './customer-http';
export class PlatformError extends Error {
  constructor(public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'SLUG_EXISTS' | 'EMAIL_EXISTS' | 'NOT_FOUND', public status: number) { super(code); }
}
export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new PlatformError('UNAUTHORIZED', 401);
  if (session.user.role !== 'SUPER_ADMIN' || session.user.restaurantId) throw new PlatformError('FORBIDDEN', 403);
  return session.user;
}
export async function requireSuperAdminPage() {
  try { return await requireSuperAdmin(); } catch (error) {
    if (error instanceof PlatformError) redirect(error.status === 401 ? '/login' : '/dashboard');
    throw error;
  }
}
export function platformFailure(error: unknown) {
  return error instanceof PlatformError ? customerJson({ error: { code: error.code } }, error.status) : customerFailure(error);
}
